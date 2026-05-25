output "deployment_note" {
  description = "Reminder that this is a skeleton only."
  value       = "AWS deployment skeleton only. No resources are created by this sprint."
}

output "local_gateway_mapping" {
  description = "Local security gateway production mapping."
  value       = "security-gateway maps to API Gateway + WAF + private service integration."
}
