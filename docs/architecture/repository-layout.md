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

## Future extraction (not implemented)

Window features, screen-gaze calibration, new task adapters and protocol phases belong in the existing domain folders. Offline analysis goes under analysis/src/neurolens/, analysis/tests/, analysis/notebooks/ and analysis/configs/ when Step 6 starts. Do not create empty placeholder directories or V1/V2 copies.

Participant exports and generated models/reports stay outside tracked source by default. Public demonstration artifacts require synthetic or intentionally approved de-identified data and clear provenance.


## Independent preview preservation branch

`previews/mission/` contains the explicitly user-requested snapshot of the already-running English mission preview on `preview/mission-live-camera-v0.3`. It has its own dependency-free local server and tests; it is not a V1/V2/V3 source-version hierarchy or a change to canonical module ownership. The existing `public/collection/` entrypoints, vendor URLs, server, database, and cloud consent behavior are unchanged. The snapshot deliberately preserves its current algorithms and relative asset paths rather than refactoring behavior during a publishing-only handoff. Future integrated implementation should use the canonical domain modules and the normal research/schema acceptance gates, not treat this snapshot as a second canonical platform.
