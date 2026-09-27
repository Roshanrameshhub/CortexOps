# Ecosystem Agent - Google Cloud Run Configuration
#
# Phase 5 - Ecosystem & Collaboration (Layer 1)
# Classification: ECOSYSTEM_ANALYTICS
#
# Purpose:
#   - Aggregation
#   - Indexing
#   - Cross-system analytics
#
# MUST NOT:
#   - Mutate state
#   - Commit actions
#
# DecisionEvent signals:
#   - consensus_signal
#   - aggregation_signal
#   - strategic_signal (no conclusions)
#
# Performance Budgets:
#   - MAX_TOKENS: 1500
#   - MAX_LATENCY_MS: 3000

# Variables
variable "ecosystem_agent_version" {
  description = "Ecosystem agent version"
  type        = string
  default     = "1.0.0"
}

variable "ecosystem_max_latency_ms" {
  description = "Maximum latency budget in milliseconds"
  type        = number
  default     = 3000
}

variable "ecosystem_max_tokens" {
  description = "Maximum token budget"
  type        = number
  default     = 1500
}

# Secret for API key
resource "google_secret_manager_secret" "ecosystem_agent_ruvector_key" {
  secret_id = "ecosystem-agent-ruvector-key"

  replication {
    auto {}
  }

  labels = {
    agent          = "ecosystem-agent"
    component      = "agents"
    phase          = "5"
    classification = "ecosystem-analytics"
  }
}

resource "google_secret_manager_secret_version" "ecosystem_agent_ruvector_key_version" {
  secret      = google_secret_manager_secret.ecosystem_agent_ruvector_key.id
  secret_data = var.ruvector_api_key
}

# Cloud Function (Gen 2) - Edge Function
resource "google_cloudfunctions2_function" "ecosystem_agent" {
  name        = "ecosystem-agent"
  location    = var.region
  description = "Ecosystem Agent (Phase 5) - Aggregation, Indexing, Cross-system Analytics"

  build_config {
    runtime     = "nodejs20"
    entry_point = "ecosystemHandler"

    source {
      storage_source {
        bucket = google_storage_bucket.agent_source.name
        object = google_storage_bucket_object.ecosystem_agent_source.name
      }
    }

    environment_variables = {
      NODE_ENV = "production"
    }
  }

  service_config {
    min_instance_count               = 0
    max_instance_count              = 50  # Lower than other agents due to analytics nature
    available_memory                = "512Mi"
    available_cpu                   = "1"
    timeout_seconds                 = 5   # Strict timeout for 3000ms budget + overhead
    max_instance_request_concurrency = 40

    environment_variables = {
      LOG_LEVEL            = "info"
      AGENT_VERSION        = var.ecosystem_agent_version
      RUVECTOR_SERVICE_URL = var.ruvector_service_url
      TELEMETRY_ENABLED    = "true"
      # Performance budget enforcement
      MAX_LATENCY_MS       = var.ecosystem_max_latency_ms
      MAX_TOKENS           = var.ecosystem_max_tokens
      # Phase 5 specific
      AGENT_PHASE          = "5"
      AGENT_LAYER          = "1"
      AGENT_CLASSIFICATION = "ECOSYSTEM_ANALYTICS"
      # Role clarity
      ALLOW_STATE_MUTATION = "false"
      ALLOW_ACTION_COMMIT  = "false"
    }

    secret_environment_variables {
      key        = "RUVECTOR_API_KEY"
      project_id = var.project_id
      secret     = google_secret_manager_secret.ecosystem_agent_ruvector_key.secret_id
      version    = "latest"
    }

    service_account_email = google_service_account.agent_service_account.email

    vpc_connector                 = google_vpc_access_connector.marketplace_connector.id
    vpc_connector_egress_settings = "PRIVATE_RANGES_ONLY"
  }

  labels = {
    agent          = "ecosystem-agent"
    classification = "ecosystem-analytics"
    phase          = "5"
    layer          = "1"
    version        = replace(var.ecosystem_agent_version, ".", "-")
  }
}

# IAM - Allow service mesh invocation
resource "google_cloudfunctions2_function_iam_member" "ecosystem_agent_invoker" {
  project        = google_cloudfunctions2_function.ecosystem_agent.project
  location       = google_cloudfunctions2_function.ecosystem_agent.location
  cloud_function = google_cloudfunctions2_function.ecosystem_agent.name
  role           = "roles/cloudfunctions.invoker"
  member         = "serviceAccount:${google_service_account.marketplace_service_account.email}"
}

# Cloud Run service (primary deployment for Phase 5)
resource "google_cloud_run_v2_service" "ecosystem_agent" {
  name     = "ecosystem-agent"
  location = var.region

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "gcr.io/${var.project_id}/ecosystem-agent:${var.ecosystem_agent_version}"

      ports {
        container_port = 8080
      }

      env {
        name  = "LOG_LEVEL"
        value = "info"
      }

      env {
        name  = "AGENT_VERSION"
        value = var.ecosystem_agent_version
      }

      env {
        name  = "RUVECTOR_SERVICE_URL"
        value = var.ruvector_service_url
      }

      # Performance budget
      env {
        name  = "MAX_LATENCY_MS"
        value = tostring(var.ecosystem_max_latency_ms)
      }

      env {
        name  = "MAX_TOKENS"
        value = tostring(var.ecosystem_max_tokens)
      }

      # Phase 5 configuration
      env {
        name  = "AGENT_PHASE"
        value = "5"
      }

      env {
        name  = "AGENT_LAYER"
        value = "1"
      }

      env {
        name  = "AGENT_CLASSIFICATION"
        value = "ECOSYSTEM_ANALYTICS"
      }

      # Role clarity enforcement
      env {
        name  = "ALLOW_STATE_MUTATION"
        value = "false"
      }

      env {
        name  = "ALLOW_ACTION_COMMIT"
        value = "false"
      }

      env {
        name = "RUVECTOR_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.ecosystem_agent_ruvector_key.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        http_get {
          path = "/ecosystem/health"
          port = 8080
        }
        initial_delay_seconds = 3
        timeout_seconds       = 3
        period_seconds        = 5
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/ecosystem/health"
          port = 8080
        }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 15
        failure_threshold     = 3
      }
    }

    service_account = google_service_account.agent_service_account.email

    vpc_access {
      connector = google_vpc_access_connector.marketplace_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    # Annotations for Phase 5 requirements
    annotations = {
      "run.googleapis.com/execution-environment" = "gen2"
      "marketplace.llm/agent-phase"              = "5"
      "marketplace.llm/agent-layer"              = "1"
      "marketplace.llm/classification"           = "ECOSYSTEM_ANALYTICS"
      "marketplace.llm/max-latency-ms"           = tostring(var.ecosystem_max_latency_ms)
      "marketplace.llm/max-tokens"               = tostring(var.ecosystem_max_tokens)
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = {
    agent          = "ecosystem-agent"
    classification = "ecosystem-analytics"
    phase          = "5"
    layer          = "1"
  }
}

# Cloud Run IAM
resource "google_cloud_run_v2_service_iam_member" "ecosystem_agent_invoker" {
  project  = google_cloud_run_v2_service.ecosystem_agent.project
  location = google_cloud_run_v2_service.ecosystem_agent.location
  name     = google_cloud_run_v2_service.ecosystem_agent.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.marketplace_service_account.email}"
}

# Outputs
output "ecosystem_agent_function_url" {
  description = "Ecosystem agent Cloud Function URL"
  value       = google_cloudfunctions2_function.ecosystem_agent.url
}

output "ecosystem_agent_cloud_run_url" {
  description = "Ecosystem agent Cloud Run URL"
  value       = google_cloud_run_v2_service.ecosystem_agent.uri
}

output "ecosystem_agent_version" {
  description = "Deployed ecosystem agent version"
  value       = var.ecosystem_agent_version
}

output "ecosystem_agent_budget" {
  description = "Ecosystem agent performance budget"
  value = {
    max_latency_ms = var.ecosystem_max_latency_ms
    max_tokens     = var.ecosystem_max_tokens
  }
}
