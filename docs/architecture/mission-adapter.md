# Mission event adapter (provisional)

Status: **Implemented as a local engineering foundation; not scientifically validated.** Contract id: `mission-event/0.1-provisional`. Scientific review: **PENDING_SCIENTIFIC_REVIEW**.

This adapter sits between tracking lifecycle events and the existing V1 session record. It does not replace `schema_version` `1.0.0`, does not upload, and does not define PVT, Go/No-Go trial semantics, or fatigue-rating science.

## Boundary

| Owner | Responsibility |
|---|---|
| `public/collection/tracking/lifecycle.js` | Generation, exclusive calibration deadline on acquisition time, invalid/future/out-of-order rejection, pre/post task admission |
| `public/collection/tracking/controller.js` | Camera/Worker resources; generation-scoped async acquire/play/ended/bitmap; `expired` before `enough` |
| `public/collection/session/mission-adapter.js` | Task start/end windows, session/task-relative clocks, local-only metadata |
| `public/collection/features/accumulator.js` | Shared feature engine; dropout is `tracking_gap`, not open eyes |
| Caijia | PVT/Go-No-Go definitions, ratings protocol, measurement QA |

V1 collection remains the browser entrypoint. Preview snapshot `preview/mission-live-camera-v0.3` @ `663ed79` is not merged and is not a second tracking engine.

## Local metadata

`attachLocalMetadata(session)` adds `session.mission` only:

- `contract_id`, `scientific_review`, `local_only: true`, `upload_eligible: false`
- versioned events (`mission_session_started`, `mission_task_started`, `mission_task_ended`, `mission_frame_rejected`, `mission_dropout`, `mission_resources_cleared`)
- task windows with `started_session_ms` / `ended_session_ms`

`schema_version` stays `1.0.0`. Cloud `sanitizeSession` still allowlists V1 fields and drops `mission`. Preview `mission-preview-1` records are detected by `readCompatibleSession` and are not coerced.

## Unsigned scientific contracts

Unsigned protocol ids are stored as `PENDING_SCIENTIFIC_REVIEW`. Existing V1 Go/No-Go keeps `protocol_id: go-no-go-v1` with review tag `v1-existing`. Do not treat adapter task kinds as validated PVT or as a three-rating mission protocol.
