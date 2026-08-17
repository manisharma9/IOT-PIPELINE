# Public Demo Validation Report

## Executive Summary

The multi-household customer demonstration was implemented and exercised on
24 July 2026 on the local Windows laptop.

The validated configuration represented 20 households and 241 simulated
devices in one bounded fleet process. All 13 device categories generated
telemetry, all 241 devices reached raw and normalized storage, the customer
read model returned paginated and filtered real records, and the complete DSO
approval/mock-dispatch/device-translation/dataspace workflow passed through
the security gateway.

A Cloudflare Quick Tunnel exposed only the Next.js customer dashboard. The
temporary HTTPS URL loaded successfully in a remote browser, while internal
routes, hostnames, and Docker ports remained unavailable.

The main remaining limitation is local semantic throughput and strict-output
quality. The single Phi-3 Mini worker received fleet readings but ran behind
the normalized stream and safely rejected most completed outputs. No raw or
normalized telemetry was silently dropped. This result must not be presented
as full semantic completion for the 241-device workload.

## Configuration

| Item | Validated value |
| --- | --- |
| Branch | `customer-facing-enershare-dashboard` |
| Fleet processes | 1 |
| Per-device processes or threads | 0 |
| Households | 20 |
| Devices | 241 |
| Average devices per household | 12.05 |
| Apartment / standard / prosumer | 6 / 8 / 6 |
| Device categories | 13 |
| Reporting interval | 180 seconds with jitter |
| Maximum in-flight gateway requests | 8 |
| Customer dashboard | Next.js production build |
| Public ingress | Free Cloudflare Quick Tunnel |
| Public tunnel origin | `http://127.0.0.1:3000` |
| Device execution | simulated only |

## Fleet Results

Runtime evidence captured during the validation:

| Measure | Result |
| --- | ---: |
| Telemetry generated | 3,436 |
| Telemetry accepted | 3,436 |
| Delivery attempts | 3,442 |
| Delivery retries | 6 |
| Dropped telemetry | 0 |
| Raw fleet rows in TimescaleDB | 3,781 |
| Normalized fleet readings | 14,207 |
| Devices in raw telemetry | 241 |
| Devices in normalized telemetry | 241 |
| Categories in normalized telemetry | 13 of 13 |
| Processing error rows | 0 |

Raw row totals include earlier records from the same reproducible device IDs.
The delivery counter proves every generated envelope was eventually accepted,
including six retried requests.

## Category Coverage

| Category | Registered devices | Devices with normalized telemetry |
| --- | ---: | ---: |
| smart meter | 20 | 20 |
| smart plug | 38 | 38 |
| refrigerator | 20 | 20 |
| washing machine | 16 | 16 |
| clothes dryer | 12 | 12 |
| dishwasher | 18 | 18 |
| lighting circuit | 28 | 28 |
| EV charger | 18 | 18 |
| heat pump | 14 | 14 |
| thermostat/HVAC | 21 | 21 |
| water heater | 24 | 24 |
| solar inverter | 6 | 6 |
| home battery | 6 | 6 |

## Pipeline Validation

The existing gateway demo completed:

```text
security-gateway
-> DSO grid signal
-> aggregator proposal
-> review
-> approval
-> ready_to_dispatch
-> mock dispatch
-> device command audit
-> minimized dataspace export
```

Measured result:

| Check | Result |
| --- | --- |
| Gateway health | `ok` |
| DSO request | `accepted` |
| Proposal | created |
| Review | `reviewed` |
| Approval | `approved` |
| Ready state | `ready_to_dispatch` |
| Mock audit | returned rows |
| Device command audit | returned rows |
| Dataspace export | `full_pipeline_demo_summary` |
| Raw private payloads exported | false |
| Real device action | false |

All 12 health endpoints checked by `scripts/check-health.ps1` responded.

## Semantic Processing Observation

Ollama reported `phi3:mini` available and the semantic connector remained
running. For the measured fleet window:

| Measure | Result |
| --- | ---: |
| SLM audit rows | 3,041 |
| Rows with `slm_called=true` | 3,041 |
| Accepted strict mappings | 1 |
| Safely unmapped outcomes | 3,040 |
| Completed semantic batches | 90 |
| Batch input readings | 3,074 |
| Average inference latency | 38,448.8 ms |

This proves that completed readings entered the mandatory local SLM path and
were audited. It also proves the current single-worker Phi-3 configuration
does not provide acceptable strict-mapping quality or throughput for the
default continuously running fleet. Deterministic guardrails rejected
invalid model output rather than fabricating replacement semantics.

Recommended follow-up:

1. use a provider/model that reliably follows the strict batch schema;
2. tune compact prompts and batch size against measured output validity;
3. add inference replicas or a vLLM-compatible deployment;
4. monitor Kafka lag and require backlog clearance before a semantic
   scalability claim.

## Customer Read Model

Live gateway queries confirmed:

- six inventory summary metrics;
- category, online, flexibility, and state filters;
- 12-record server-side pages;
- bounded device history;
- device display name, profile, current state, power, energy, flexibility,
  last seen, and simulated command state;
- `simulated=true` and `no_real_execution=true`;
- HTTP 403 for cross-household access.

The browser did not load all 241 devices at once.

## Public Boundary Validation

| Test | Result |
| --- | --- |
| Local production dashboard | passed |
| Public `trycloudflare.com` login | passed |
| Environment-only login | passed |
| Secure remote session | passed |
| Ninth invalid login attempt | HTTP 429 |
| Legacy technical API in public mode | HTTP 404 |
| `/admin/operations` for public operator | redirected to `/dashboard` |
| Same-origin dashboard routes | passed |
| Internal address in public HTML | none found |
| Docker ports bound to loopback | all |
| Quick Tunnel shutdown | URL became unreachable |
| Quick Tunnel restart | new URL issued |

The final validation URL is temporary and is recorded at runtime in
`.runtime/public-demo/public-url.current.txt`; it is intentionally not a
stable deployment URL.

## Responsive Validation

The product was checked at:

- desktop: 1440 x 1000;
- tablet: 768 x 1024;
- mobile: 320 x 800.

All product routes completed the responsive smoke check. Device inventory
rendered 12 records per page, filters remained usable, device details loaded,
and no horizontal overflow was observed.

## Automated Validation

| Validation | Result |
| --- | --- |
| `docker compose config` | passed |
| `docker compose config --services` | passed |
| Backend/service Node tests | 192 passed, 0 failed |
| Customer product boundary tests | 8 passed, 0 failed |
| Customer lint | passed |
| Customer production build | passed |
| Client URL/key boundary check | passed |
| PowerShell syntax checks | passed |
| Full gateway demo | passed |
| Live responsive browser smoke | passed |
| Public boundary check | passed |

## Issues Found And Corrected

1. The initial three-minute fleet burst exceeded the gateway's per-IP rate
   budget. Initial emissions were distributed, the interval was adjusted,
   and failed requests now retain one bounded pending envelope for retry.
2. Windows PowerShell's legacy web parser failed a valid dashboard health
   response. Public scripts now use basic parsing.
3. A locked runtime URL marker made restart cleanup unreliable. Lifecycle
   scripts now use a current marker and clear marker contents safely.
4. The login page and legacy test scripts contained sample credentials.
   Credentials now come only from environment variables and examples use
   placeholders.
5. Device detail links did not retain operator household scope. Links now
   carry the pseudonymous selector and the gateway re-authorizes it.

## Known Limitations

- Quick Tunnel is temporary and has no production SLA.
- Login rate limits are local to one Next.js process.
- The laptop is the availability and capacity boundary.
- The default fleet outpaces the current single local Phi-3 worker.
- Most measured Phi-3 outputs failed strict validation and became safely
  unmapped.
- Inventory values are simulated and not billing-grade.
- No real household control, real provider credential, production identity,
  mTLS, or certified protocol connector is present.

## Conclusion

The expanded household fleet, ingestion/normalization path, customer read
model, protected customer dashboard, gateway workflow, simulated command
path, dataspace export, and public Quick Tunnel boundary are functioning
locally.

The implementation is suitable for a controlled customer demonstration of
multi-device household visibility. It is not yet suitable for claiming that
the full 241-device semantic workload is processed in real time. That claim
requires inference capacity and strict-output quality improvements followed
by a measured backlog-clearance validation.
