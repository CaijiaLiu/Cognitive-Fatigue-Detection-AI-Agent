# Versioned protocol and session orchestration (W3.1)

Status: **Implemented as a local engineering layer; not scientifically validated.** Contracts: `research-protocol/0.1-provisional`, `research-session/0.1-provisional`, `research-event/0.1-provisional`. Scientific review: **PENDING_SCIENTIFIC_REVIEW** except the existing V1 Go/No-Go adapter (`v1-existing`).

This layer sits on the W3.0 mission adapter. It does not replace the session controller, tracking controller, feature accumulator, or Research Agent runtime.

## Ownership

| Owner | Responsibility |
|---|---|
| `public/collection/session/protocol.js` | Generic protocol/task descriptors, review tags, event validation |
| `public/collection/session/orchestrate.js` | Deterministic session state machine and event timeline |
| `public/collection/session/orchestration-export.js` | Local-only artifact, replay, W4 reader contract |
| `public/collection/session/mission-adapter.js` | Existing task windows and `session.mission` sidecar |
| `public/collection/session/controller.js` | Unchanged V1 browser coordinator |
| Caijia | PVT/Go-No-Go trial science, ratings protocol, measurement QA |

Pause/resume is **not** implemented. Existing task semantics do not define a safe scientific pause, so inventing one would be an unapproved protocol change.

## Protocol contract

A protocol has `protocol_id`, `protocol_version`, `schema_version` (`1.0.0` identity), ordered task descriptors, config references, lifecycle boundaries (`start`/`end` once, no overlap, no pause), data-source requirements, missingness flags, and `scientific_review`.

Two built-in protocols:

- `go-no-go-v1` — adapter over the existing V1 task. Trial semantics are unchanged.
- `research-session-sequence/0.1-provisional` — two generic engineering slots (`slot-a`, `slot-b`). Not PVT, not a signed Go/No-Go replacement, and not a three-rating protocol.

Unsigned ids stay `PENDING_SCIENTIFIC_REVIEW`.

## State machine

Allowed transitions:

- `created` → `ready` | `interrupted` | `failed`
- `ready` → `running` | `interrupted` | `failed`
- `running` → `completed` | `interrupted` | `failed`
- terminal states are absorbing; repeated complete/interrupt/fail is idempotent

Rules:

- one active task;
- each task starts once and ends once (end is idempotent);
- tasks run in protocol order;
- late callbacks after a terminal state are rejected and do not mutate summaries;
- interruption ends the open task and clears timers/listeners/tracking;
- clocks are injected (`now`) for deterministic tests.

## Events

Each accepted event records session id, optional task id, type, session-relative monotonic time, task-relative time, acquisition/processing times where relevant, source (`camera` / `simulated` / `task-only`), quality/missingness, protocol/contract versions, and review status. Rejected events are stored separately and do not enter the accumulator.

## Local export

`attachLocalOrchestration(session, orchestrator)` writes `session.orchestration` and reuses the W3.0 `session.mission` sidecar. `schema_version` remains `1.0.0`. Both sidecars are `local_only` / `upload_eligible: false`. Cloud `sanitizeSession` is unchanged and still strips unknown fields.

See [W4 session artifact](w4-session-artifact.md).
