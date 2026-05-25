terraform {
  required_version = ">= 1.6.0"
}

# Production alignment skeleton only.
# This sprint does not create real AWS resources and does not run terraform apply.

locals {
  project_name = var.project_name
  environment  = var.environment
}
