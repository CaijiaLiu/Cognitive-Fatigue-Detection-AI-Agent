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

## Planned module extraction (create when implemented)

| Proposed path | Contents | Step |
|---|---|---|
| public/collection/features/ | Ocular, facial, head, gaze and window feature modules | 2–3 |
| public/collection/tracking/ | Calibration, adapter interfaces and quality helpers | 2–3 |
| public/collection/tasks/ | Go/No-Go task adapter and future task adapters | 4 |
| public/collection/session/ | Protocol phases, timing, consent and session orchestration | 4 |
| public/collection/reporting/ | Browser charts and timelines | 5 |
| analysis/src/neurolens/ | Export validation, windows, statistics and model evaluation | 6–7 |
| analysis/tests/ | Synthetic fixtures and reproducibility/leakage checks | 6–7 |
| analysis/notebooks/ | Exploratory notebooks calling tested analysis code | 6 |
| analysis/configs/ | Versioned analysis configurations | 6–7 |

Do not create empty placeholder folders or V1/V2 copies. Extract modules incrementally; maintain existing entrypoints until all consumers have migrated.

Participant exports and generated models/reports stay outside tracked source by default. Public demonstration artifacts require synthetic or intentionally approved de-identified data and clear provenance.
