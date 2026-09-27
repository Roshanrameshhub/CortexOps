# Deprecation Agent - Google Cloud Edge Function Configuration
#
# Classification: LIFECYCLE MANAGEMENT
# Purpose: Manage controlled deprecation and retirement of marketplace assets

# Variables
variable "deprecation_agent_version" {
  description = "Deprecation agent version"
  type        = string
  default     = "1.0.0"
}

variable "ruvector_service_url" {
  description = "RuVector service URL"
  type        = string
}

variable "ruvector_api_key" {
  description = "RuVector API key"
  type        = string
  sensitive   = true
}

# Secret for API key
resource "google_secret_manager_secret" "deprecation_agent_ruvector_key" {
  secret_id = "deprecation-agent-ruvector-key"

  replication {
    auto {}
  }

  labels = {
    agent     = "deprecation-agent"
    component = "agents"
  }
}

resource "google_secret_manager_secret_version" "deprecation_agent_ruvector_key_version" {
  secret      = google_secret_manager_secret.deprecation_agent_ruvector_key.id
  secret_data = var.ruvector_api_key
}

# Cloud Function (Gen 2) - Edge Function
resource "google_cloudfunctions2_function" "deprecation_agent" {
  name        = "deprecation-agent"
  location    = var.region
  description = "Deprecation Agent - Lifecycle Management for LLM Marketplace"

  build_config {
    runtime     = "nodejs20"
    entry_point = "deprecationHandler"

    source {
      storage_source {
        bucket = google_storage_bucket.agent_source.name
        object = google_storage_bucket_object.deprecation_agent_source.name
      }
    }

    environment_variables = {
      NODE_ENV = "production"
    }
  }

  service_config {
    min_instance_count               = 0
    max_instance_count              = 100
    available_memory                = "512Mi"
    available_cpu                   = "1"
    timeout_seconds                 = 60
    max_instance_request_concurrency = 80

    environment_variables = {
      LOG_LEVEL                      = "info"
      AGENT_VERSION                  = var.deprecation_agent_version
      RUVECTOR_SERVICE_URL           = var.ruvector_service_url
      MAX_CONSUMERS_AUTO_DEPRECATION = "100"
      DEFAULT_SUNSET_PERIOD_DAYS     = "90"
      TELEMETRY_ENABLED              = "true"
    }

    secret_environment_variables {
      key        = "RUVECTOR_API_KEY"
      project_id = var.project_id
      secret     = google_secret_manager_secret.deprecation_agent_ruvector_key.secret_id
      version    = "latest"
    }

    service_account_email = google_service_account.agent_service_account.email

    vpc_connector                 = google_vpc_access_connector.marketplace_connector.id
    vpc_connector_egress_settings = "PRIVATE_RANGES_ONLY"
  }

  labels = {
    agent          = "deprecation-agent"
    classification = "lifecycle-management"
    version        = replace(var.deprecation_agent_version, ".", "-")
  }
}

# IAM - Allow unauthenticated invocation (for internal service mesh)
resource "google_cloudfunctions2_function_iam_member" "deprecation_agent_invoker" {
  project        = google_cloudfunctions2_function.deprecation_agent.project
  location       = google_cloudfunctions2_function.deprecation_agent.location
  cloud_function = google_cloudfunctions2_function.deprecation_agent.name
  role           = "roles/cloudfunctions.invoker"
  member         = "serviceAccount:${google_service_account.marketplace_service_account.email}"
}

# Cloud Run service (alternative deployment)
resource "google_cloud_run_v2_service" "deprecation_agent" {
  name     = "deprecation-agent"
  location = var.region

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "gcr.io/${var.project_id}/deprecation-agent:${var.deprecation_agent_version}"

      ports {
        container_port = 8080
      }

      env {
        name  = "LOG_LEVEL"
        value = "info"
      }

      env {
        name  = "AGENT_VERSION"
        value = var.deprecation_agent_version
      }

      env {
        name  = "RUVECTOR_SERVICE_URL"
        value = var.ruvector_service_url
      }

      env {
        name = "RUVECTOR_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.deprecation_agent_ruvector_key.secret_id
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
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 5
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    service_account = google_service_account.agent_service_account.email

    vpc_access {
      connector = google_vpc_access_connector.marketplace_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = {
    agent          = "deprecation-agent"
    classification = "lifecycle-management"
  }
}

# Cloud Run IAM
resource "google_cloud_run_v2_service_iam_member" "deprecation_agent_invoker" {
  project  = google_cloud_run_v2_service.deprecation_agent.project
  location = google_cloud_run_v2_service.deprecation_agent.location
  name     = google_cloud_run_v2_service.deprecation_agent.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.marketplace_service_account.email}"
}

# Outputs
output "deprecation_agent_function_url" {
  description = "Deprecation agent Cloud Function URL"
  value       = google_cloudfunctions2_function.deprecation_agent.url
}

output "deprecation_agent_cloud_run_url" {
  description = "Deprecation agent Cloud Run URL"
  value       = google_cloud_run_v2_service.deprecation_agent.uri
}

output "deprecation_agent_version" {
  description = "Deployed deprecation agent version"
  value       = var.deprecation_agent_version
}
