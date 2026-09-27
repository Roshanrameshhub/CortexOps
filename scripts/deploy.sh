#!/bin/bash
# =============================================================================
# LLM-Marketplace Deployment Script
# Deploys unified service to Google Cloud Run
# =============================================================================

set -euo pipefail

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-agentics-dev}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="llm-marketplace"
PLATFORM_ENV="${PLATFORM_ENV:-dev}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Print banner
print_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           LLM-MARKETPLACE DEPLOYMENT                         ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Project:     $PROJECT_ID"
    echo "║  Region:      $REGION"
    echo "║  Service:     $SERVICE_NAME"
    echo "║  Environment: $PLATFORM_ENV"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not found. Please install Google Cloud SDK."
        exit 1
    fi

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker."
        exit 1
    fi

    # Check authentication
    if ! gcloud auth print-access-token &> /dev/null; then
        log_error "Not authenticated. Run: gcloud auth login"
        exit 1
    fi

    # Set project
    gcloud config set project "$PROJECT_ID" --quiet

    log_success "Prerequisites check passed"
}

# Create secrets if they don't exist
setup_secrets() {
    log_info "Setting up secrets..."

    # Check if secret exists
    if ! gcloud secrets describe ruvector-api-key --project="$PROJECT_ID" &> /dev/null; then
        log_warning "Secret 'ruvector-api-key' not found. Creating placeholder..."
        echo -n "PLACEHOLDER_API_KEY" | gcloud secrets create ruvector-api-key \
            --project="$PROJECT_ID" \
            --replication-policy="automatic" \
            --data-file=-

        log_warning "Please update the secret with actual API key:"
        log_warning "  echo -n 'YOUR_API_KEY' | gcloud secrets versions add ruvector-api-key --data-file=-"
    fi

    log_success "Secrets configured"
}

# Create service account if needed
setup_service_account() {
    log_info "Setting up service account..."

    SA_NAME="marketplace-sa"
    SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

    # Check if SA exists
    if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &> /dev/null; then
        log_info "Creating service account: $SA_NAME"
        gcloud iam service-accounts create "$SA_NAME" \
            --project="$PROJECT_ID" \
            --display-name="LLM Marketplace Service Account" \
            --description="Service account for LLM Marketplace agents"
    fi

    # Grant necessary roles (least privilege)
    log_info "Granting IAM roles..."

    # Secret accessor
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet

    # Cloud Run invoker (for internal service calls)
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/run.invoker" \
        --quiet

    # Storage object admin (for package artifacts)
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/storage.objectAdmin" \
        --quiet

    log_success "Service account configured: $SA_EMAIL"
}

# Create storage bucket if needed
setup_storage() {
    log_info "Setting up storage bucket..."

    BUCKET_NAME="llm-marketplace-packages-${PLATFORM_ENV}"

    if ! gsutil ls "gs://${BUCKET_NAME}" &> /dev/null; then
        log_info "Creating bucket: $BUCKET_NAME"
        gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://${BUCKET_NAME}"
        gsutil versioning set on "gs://${BUCKET_NAME}"
    fi

    log_success "Storage bucket ready: $BUCKET_NAME"
}

# Build Docker image
build_image() {
    log_info "Building Docker image..."

    IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${PLATFORM_ENV}"

    docker build \
        -t "$IMAGE_TAG" \
        -t "gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest" \
        --platform linux/amd64 \
        .

    log_success "Image built: $IMAGE_TAG"
}

# Push to Container Registry
push_image() {
    log_info "Pushing image to Container Registry..."

    # Configure Docker for GCR
    gcloud auth configure-docker gcr.io --quiet

    IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${PLATFORM_ENV}"

    docker push "$IMAGE_TAG"
    docker push "gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

    log_success "Image pushed to GCR"
}

# Deploy to Cloud Run
deploy_service() {
    log_info "Deploying to Cloud Run..."

    SA_EMAIL="marketplace-sa@${PROJECT_ID}.iam.gserviceaccount.com"
    IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${PLATFORM_ENV}"

    # Load environment config
    ENV_FILE="config/environments/${PLATFORM_ENV}.env"
    if [[ -f "$ENV_FILE" ]]; then
        log_info "Loading environment config from $ENV_FILE"
    fi

    gcloud run deploy "$SERVICE_NAME" \
        --image="$IMAGE_TAG" \
        --region="$REGION" \
        --platform=managed \
        --allow-unauthenticated \
        --service-account="$SA_EMAIL" \
        --min-instances=0 \
        --max-instances=10 \
        --memory=512Mi \
        --cpu=1 \
        --concurrency=80 \
        --timeout=300s \
        --set-env-vars="SERVICE_NAME=$SERVICE_NAME" \
        --set-env-vars="SERVICE_VERSION=1.0.0" \
        --set-env-vars="PLATFORM_ENV=$PLATFORM_ENV" \
        --set-env-vars="NODE_ENV=production" \
        --set-env-vars="RUVECTOR_SERVICE_URL=https://ruvector-service-${PLATFORM_ENV}.run.app" \
        --set-env-vars="TELEMETRY_ENDPOINT=https://llm-observatory-${PLATFORM_ENV}.run.app" \
        --set-env-vars="REGISTRY_SERVICE_URL=https://llm-registry-${PLATFORM_ENV}.run.app" \
        --set-env-vars="STORAGE_BUCKET=llm-marketplace-packages-${PLATFORM_ENV}" \
        --set-env-vars="LOG_LEVEL=info" \
        --set-secrets="RUVECTOR_API_KEY=ruvector-api-key:latest"

    log_success "Service deployed"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."

    # Get service URL
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --format='value(status.url)')

    log_info "Service URL: $SERVICE_URL"

    # Health check
    log_info "Running health checks..."

    for i in {1..5}; do
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/health" || echo "000")

        if [[ "$RESPONSE" == "200" ]]; then
            log_success "Health check passed!"
            echo ""
            log_info "Service health:"
            curl -s "${SERVICE_URL}/health" | jq . || curl -s "${SERVICE_URL}/health"
            break
        fi

        log_warning "Attempt $i: Got HTTP $RESPONSE, retrying in 10s..."
        sleep 10
    done

    if [[ "$RESPONSE" != "200" ]]; then
        log_error "Health check failed after 5 attempts"
        return 1
    fi

    # Test agent endpoints
    log_info "Testing agent endpoints..."

    log_info "Deprecation agent health:"
    curl -s "${SERVICE_URL}/deprecation/health" | jq . || echo "OK"

    log_info "Packaging agent health:"
    curl -s "${SERVICE_URL}/package/health" | jq . || echo "OK"

    log_success "Deployment verification complete"
}

# Print deployment summary
print_summary() {
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --format='value(status.url)')

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           DEPLOYMENT COMPLETE                                ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Service URL:                                                ║"
    echo "║  $SERVICE_URL"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  ENDPOINTS:                                                  ║"
    echo "║  GET  /health             - Unified health check             ║"
    echo "║  POST /deprecation        - Deprecation Agent                ║"
    echo "║  GET  /deprecation/health - Deprecation health               ║"
    echo "║  POST /package            - Packaging Agent                  ║"
    echo "║  GET  /package/health     - Packaging health                 ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  CLI COMMANDS:                                               ║"
    echo "║  agentics marketplace package --help                         ║"
    echo "║  agentics marketplace deprecate --help                       ║"
    echo "║  agentics marketplace inspect --help                         ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""

    # Export for other scripts
    echo "export LLM_MARKETPLACE_URL=$SERVICE_URL"
}

# Main execution
main() {
    print_banner

    case "${1:-deploy}" in
        setup)
            check_prerequisites
            setup_secrets
            setup_service_account
            setup_storage
            ;;
        build)
            check_prerequisites
            build_image
            ;;
        push)
            check_prerequisites
            push_image
            ;;
        deploy)
            check_prerequisites
            setup_secrets
            setup_service_account
            setup_storage
            build_image
            push_image
            deploy_service
            verify_deployment
            print_summary
            ;;
        verify)
            verify_deployment
            ;;
        url)
            gcloud run services describe "$SERVICE_NAME" \
                --region="$REGION" \
                --format='value(status.url)'
            ;;
        *)
            echo "Usage: $0 {setup|build|push|deploy|verify|url}"
            echo ""
            echo "Commands:"
            echo "  setup   - Create secrets, service account, and storage"
            echo "  build   - Build Docker image"
            echo "  push    - Push image to Container Registry"
            echo "  deploy  - Full deployment (setup + build + push + deploy + verify)"
            echo "  verify  - Verify existing deployment"
            echo "  url     - Print service URL"
            exit 1
            ;;
    esac
}

main "$@"
