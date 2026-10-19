# Repository layout and file ownership

## Current locations (preserved)

| Path | Responsibility |
|---|---|
| README.md | Project entry, current features and run commands |
| AGENTS.md | Shared contributor/AI contract |
| docs/architecture/ | Canonical architecture, flow, data contracts and layout |
| docs/planning/ | Steps, acceptance gates and implementation status |
| docs/research/ | Hypotheses, protocols and feature definitions |
| docs/operations/ | Hosting/privacy behavior and starter reference |
| docs/reference/ | Original proposal; historical, not implementation status |
| public/collection/ | Existing standalone browser collection surface |
| public/collection/vendor/ | Pinned tracking model/WASM and licenses |
| app/api/ | Upload and protected research endpoints |
| app/research/ | Private researcher UI |
| app/chatgpt-auth.ts | Hosting identity integration |
| lib/research-data.mjs | Cloud DTO validation and field allowlist |
| lib/research.ts | Server authorization, database and request helpers |
| db/ and drizzle/ | D1 schema and ordered migrations |
| tests/ | Existing validation/integration tests |
| scripts/ and build/ | Runtime/build/install helpers |
| components/, hooks/, lib/connector* | Shared UI and starter integration |
| examples/d1/ | Starter examples, not project research features |
| vendor/ | Other dependency assets/licenses |

## Documentation moves in this change

- RESEARCH.md content moves to docs/operations/data-collection-and-hosting.md.
- docs/STARTER.md content moves to docs/operations/STARTER.md.
- Old paths retain short redirects for existing links.
- Original NeuroLens framework is preserved under docs/reference/.
- Runtime code stays at current paths: moving it requires coordinated imports, Worker URLs, static asset URLs and integration tests.

## Implemented module layout

| Path | Contents |
|---|---|
| public/collection/tracking/ | Camera adapter, classic MediaPipe Worker implementation and tracking controller |
| public/collection/features/ | Landmark extraction, time-series accumulator, unavailable-vision summary |
| public/collection/tasks/ | Go/No-Go adapter owns trials/timers; task summary is pure |
| public/collection/session/ | Session coordinator, version constants, source labels and demo |
| public/collection/reporting/ | SVG dashboard, display formatting, shared exports and download helpers |
| public/collection/persistence/ | IndexedDB store and opt-in cloud lifecycle |
| public/collection/shared/ | Pure numeric helpers |
| lib/research/ | Server helpers and allowlisted payload validator |

app.js remains the browser entrypoint. core.js, camera.js, storage.js, cloud.js, lib/research.ts and lib/research-data.mjs are compatibility facades. tracker.worker.js remains a classic Worker bootstrap, preserving its URL and vendor asset base. The server export endpoint imports the DOM-free reporting/export.js directly.

The session controller composes explicit task/tracking controllers and owns session/save/history UI state. Task and tracking controllers receive callbacks rather than import the coordinator; feature/export modules do not access the DOM. Display rendering belongs in reporting. Vendor assets, framework helpers and database migrations retain their required locations.

## Analysis and agent tools

| Path | Contents |
|---|---|
| analysis/src/neurolens/agent/ | Read-only W1 tool interface, evidence artifacts, structured validators and deterministic fixture catalog |
| analysis/src/neurolens/adapter/ | Offline V1 JSON export → evidence-artifact store for the same tool interface |
| analysis/src/neurolens/eval/ | API-independent prompt builder, evaluation harness and W1.6 offline pipeline |
| analysis/src/neurolens/runtime/ | Mock-provider Research Agent orchestrator, HTTP adapter, and demo view-model |
| analysis/prompts/ | Versioned research-agent system prompt |
| analysis/fixtures/exports/ | Synthetic V1-format export fixtures only; not real participant records |
| tests/agent-tools.test.mjs | Numeric fidelity, missing evidence, protocol mismatch, unsupported-claim and request-rejection tests |
| tests/analysis-adapter.test.mjs | Export accept/reject, privacy redaction, comparison coverage and tool retrieval tests |
| tests/agent-eval.test.mjs | Prompt package, gold/trap scoring and CLI tests |
| tests/analysis-integration.test.mjs | End-to-end export → tools → prompt → validator tests |
| tests/agent-reliability.test.mjs | Adversarial, prompt-boundary and metamorphic contract tests |
| tests/agent-runtime.test.mjs | Mock provider, orchestration, fail-closed and audit tests |
| tests/agent-api.test.mjs | HTTP handler, allowlist, leakage and demo view-model tests |
| app/api/research-agent/ | Thin vinext route that calls the analysis HTTP adapter |
| app/research-agent/ | Synthetic Research Agent demo panel |
| lib/research-agent.mjs | Server facade; does not import D1 or collection |
| docs/architecture/agent-tools.md | Implemented W1 contract and open review questions |
| docs/architecture/analysis-export-adapter.md | Implemented offline adapter boundary and blocked scientific mappings |
| docs/architecture/agent-eval.md | Manual ChatGPT evaluation workflow |
| docs/architecture/analysis-integration.md | Integrated offline pipeline and reproducibility command |
| docs/architecture/agent-reliability.md | Threat model, adversarial categories and remaining reliability limits |
| docs/architecture/agent-runtime.md | Runtime architecture, provider interface and audit schema |
| docs/architecture/agent-api.md | HTTP contract, demo UI, and UI/API/runtime/evidence boundary |

This is deterministic scaffolding over synthetic fixtures. It is not an LLM runtime, not a statistics pipeline, and not scientific validation. Window features, screen-gaze calibration, new task adapters and protocol phases still belong in the existing collection domain folders. Offline statistics/notebooks remain future work under analysis/tests/, analysis/notebooks/ and analysis/configs/ when Step 6 starts. Do not create empty placeholder directories or V1/V2 copies.

Participant exports and generated models/reports stay outside tracked source by default. Public demonstration artifacts require synthetic or intentionally approved de-identified data and clear provenance.
