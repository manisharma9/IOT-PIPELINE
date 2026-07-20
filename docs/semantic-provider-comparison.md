# Semantic Provider Comparison

## Common Contract

Both providers implement health check, warm-up, strict structured inference, timeout, bounded concurrency, circuit breaker, provider/model identity, request identity, latency, and token-usage metadata where available. Neither provider permits deterministic replacement mappings.

| Capability | Ollama provider | vLLM-compatible provider |
|---|---|---|
| Primary purpose | Local development and small measured tests | Deployment-ready high-throughput inference path |
| API | `POST /api/generate` | OpenAI-compatible `POST /v1/chat/completions` |
| Structured output | Ollama JSON schema `format` | Strict `response_format.json_schema` |
| Default concurrency | 1 | 8, configurable |
| Model | `phi3:mini` by default | Configurable served model |
| Credentials | None for local endpoint | Optional API key, never hardcoded |
| Scale method | One local model process | Multiple GPU replicas behind a service endpoint |

## Configuration

Select `SLM_PROVIDER=ollama` or `SLM_PROVIDER=vllm`. Configure endpoints with `OLLAMA_BASE_URL` or `VLLM_BASE_URL`; configure models with `SLM_MODEL` / `OLLAMA_MODEL` or `VLLM_MODEL`.

## Deployment Decision

Ollama remains the reference provider for local correctness. A 10,000-device validation should use a measured vLLM-compatible deployment with sufficient aggregate reading throughput, not assume that an optimized server or additional GPU will meet the target. Provider contract tests verify request shape without requiring a paid service.

