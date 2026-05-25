# ECS Module Placeholder

Future purpose:

- Run AD-FLEX services as ECS/Fargate tasks.
- Keep internal services private.
- Expose only API Gateway or a private load balancer integration.

Local mapping:

- Docker Compose services under `services/`.

Credentials needed later:

- ECR image repository access
- ECS task execution role
- Task role permissions for secrets, logs, and network access
