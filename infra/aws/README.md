# AWS Deployment Skeleton

This folder is a deployment-ready architecture skeleton only. It does not create cloud resources by itself, and this sprint does not run `terraform apply`.

Do not place AWS credentials, Shelly credentials, Enode credentials, Easee credentials, or ENERSHARE credentials in this repository.

## Local To AWS Mapping

| Local Component | AWS Production Mapping |
| --- | --- |
| `security-gateway` | Amazon API Gateway plus AWS WAF and private integration to services. |
| `EDGE_API_KEY` | AWS Secrets Manager, API Gateway usage plan, or a future identity-aware key flow. |
| JWT-ready middleware | Amazon Cognito or API Gateway JWT authorizer. |
| Rate limiting | API Gateway throttling plus WAF rate-based rules. |
| IP filtering | WAF IP sets. |
| DPI-style inspection | WAF managed rule groups plus custom inspection rules. |
| TLS/mTLS | ACM certificate, API Gateway custom domain, and API Gateway mTLS truststore. |
| Node services | ECS/Fargate containers behind private networking. |
| Kafka | Amazon MSK or a managed/self-hosted Kafka option. |
| MQTT broker | AWS IoT Core or a containerized broker for staging. |
| TimescaleDB | Managed Timescale/Postgres or self-hosted staging database. |
| Frontend | CloudFront/S3 or Amplify calling API Gateway only. |

## Future Deployment Steps

1. Add real AWS account and region settings through local tfvars or CI secrets.
2. Add a remote Terraform backend.
3. Add API Gateway, WAF, ECS, secrets, database, Kafka, and frontend modules.
4. Add CI/CD build and image publishing.
5. Add production observability, backup, and incident processes.

## Safety Position

This folder prepares the shape of the production deployment. It does not enable real device control, real connector credentials, or certified IEEE 2030.5/ENERSHARE behavior.
