variable "aws_region" {
  description = "Target AWS region for a future deployment."
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name prefix for future AWS resources."
  type        = string
  default     = "adflex"
}

variable "api_domain_name" {
  description = "Future API Gateway custom domain name."
  type        = string
  default     = ""
}

variable "frontend_domain" {
  description = "Future frontend domain name."
  type        = string
  default     = ""
}

variable "enable_mtls" {
  description = "Future flag for API Gateway mutual TLS."
  type        = bool
  default     = false
}

variable "enable_real_connectors" {
  description = "Future flag for real external connector integrations."
  type        = bool
  default     = false
}
