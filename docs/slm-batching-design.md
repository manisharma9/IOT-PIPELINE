# SLM Microbatching Design

## Objective

Microbatching amortizes prompt and transport overhead while preserving reading-level identity, validation, audit, retry, and final status. It does not reduce the number of readings presented to the SLM.

## Configuration

| Variable | Default | Role |
|---|---:|---|
| `SLM_BATCH_MAX_READINGS` | 128 | Hard item-count ceiling |
| `SLM_BATCH_MAX_WAIT_MS` | 20 | Maximum Kafka fetch/batch wait |
| `SLM_BATCH_MAX_PROMPT_TOKENS` | 4096 | Conservative prompt plus output estimate |
| `SLM_BATCH_MAX_RETRIES` | 2 | Additional attempts for rejected or failed readings |
| `SLM_MIN_CONFIDENCE` | 0.70 | Minimum accepted confidence |

The token estimator can produce an effective batch smaller than 128. This is intentional for small-context models.

## Input Contract

Every item retains `reading_id`, `device_id`, `household_id`, source timestamp, field, value, unit, and device type before batching. The compact model prompt includes only the fields needed for classification and an allowlisted ontology vocabulary. It requests JSON only, temperature zero, no chain-of-thought, no command content, and no free-form explanation.

## Output Contract

The response is exactly one object containing a `mappings` array. Every mapping contains only:

- `reading_id`
- `saref_concept`
- `saref_property`
- `saref_unit`
- `confidence`
- `mapping_reason_code`

The schema is [slm-semantic-batch-response.schema.json](../schemas/slm-semantic-batch-response.schema.json).

## Partial Failure

Accepted items leave the retry set immediately. Only rejected or missing readings are retried. A batch-level provider failure retries the pending set. After the configured attempts, each remaining reading receives a durable safely-unmapped audit row and a dead-letter event. Valid readings from the same batch are not discarded.

## Local Versus Scalable Profiles

Phi-3 Mini through local Ollama is useful for correctness and small demonstrations. Large output arrays can exceed practical local latency or timeout limits even when they fit the token estimate. Local validation should benchmark batch sizes such as 1, 4, and 8. Production-scale targets require multiple optimized inference replicas and must be measured on the intended GPU hardware.

