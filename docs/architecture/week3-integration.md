# W3.3 — End-to-end research-session integration

Status: **Engineering complete (offline).** Not a live-camera validation. Not scientifically validated. Not deployed.

Contracts: `research-session-integration/0.1-provisional` on top of W3.0–W3.2. Decision: [DEC-015](../planning/decision-log.md). Tests: `tests/week3-integration.test.mjs`. Closeout: [week3-closeout.md](../planning/week3-closeout.md).

```text
WEEK 3: ENGINEERING COMPLETE (OFFLINE)
REAL-DEVICE VALIDATION: PENDING
SCIENTIFIC REVIEW: PENDING
DEPLOYMENT: PENDING
BROWSER LIVE ORCHESTRATOR: NOT WIRED
```

## Actual connected path

The production composition module is `analysis/src/neurolens/integration/research-session.mjs`. It uses existing modules; it does not reimplement orchestration, evidence, or Agent tools.

```text
createResearchSessionRuntime
  → createSessionOrchestrator + createMissionAdapter + FeatureAccumulator
  → createTrackingLifecycle (admission / stale generation)
  → prepare → startSession → startTask
  → recordObservation / recordDropout / recordMissingLandmarks
  → endTask → complete | interrupt | fail
  → exportLocalSession + attachLocalOrchestration
  → adaptSessionEvidence / createSessionEvidenceTools
  → composeAnswer
```

| Path | Status |
|---|---|
| Collection controller ↔ mission adapter | Connected in the live browser (`controller.js`) |
| Orchestrator ↔ mission adapter + accumulator | Connected inside `createSessionOrchestrator` |
| Offline pipeline ↔ orchestrator ↔ local export | Connected (W3.3) |
| Local export ↔ W3.2 evidence adapter ↔ Agent tools | Connected (W3.3) |
| Live `controller.js` ↔ `createSessionOrchestrator` | **Not wired** |
| HTTP Research Agent demo ↔ `analysis-session-evidence/0.1` | **Not implemented** |
| OpenAI / D1 / Sites | **Not used** |

## Offline-only, simulated, unimplemented, blocked

| Class | What |
|---|---|
| Offline-only | Orchestrator, evidence adapter, W3.3 pipeline, Agent `composeAnswer` |
| Simulated | Injected clocks, `mode=simulated`, synthetic Go/No-Go trial extras for compatibility |
| Not implemented | Live browser orchestrator, Caijia-signed PVT/ratings/probes, real-camera QA, deployment |
| Blocked by Caijia review | Metric meaning, ocular allowlist, generic-slot science, fatigue/diagnostic claims |

Passing `tests/week3-integration.test.mjs` is **not** real-camera validation.

## Browser integration gap

`public/collection/session/controller.js` still owns `FeatureAccumulator`, `createGoNoGoTask`, and `createMissionAdapter`. `createSessionOrchestrator` also owns an accumulator and mission adapter. Wiring the orchestrator as the live owner would double-fire mission events or take over V1 Go/No-Go science.

`public/collection/session/browser-orchestration.js` is a backward-compatible optional observer. It is **off by default** and is **not imported** by `controller.js`. Enabling it later must not change trial semantics, EAR calibration, or consent.

Do not describe this week as live browser integration.

## Failure recovery

| Case | Production behavior |
|---|---|
| Normal completion | Terminal `completed` + `resources_cleared` |
| User interruption | Open task ends; status `interrupted`; no completed-session claim |
| Task / session failure | Status `failed`; quality unusable; no fabricated measurements |
| Camera unavailable | Fallback to `behavior`; ocular values stay missing |
| Missing eye landmarks | `eyes_unavailable` / missingness preserved |
| Tracking dropout | `tracking_gap`; not open eyes |
| Late processing during a task | Admitted when acquisition is in-window |
| Late / stale after terminal or generation bump | Rejected; accepted timeline unchanged |
| Out-of-order timestamps | Rejected `out_of_order` |
| Duplicate lifecycle | Idempotent terminal or rejected duplicate start |
| Cleanup | Resources cleared after terminal states |

## Privacy and science invariants

- V1 `schema_version` remains `1.0.0`.
- `sanitizeSession` still rebuilds the allowlisted V1 object and strips `mission` / `orchestration`.
- No automatic sidecar upload. No new consent assumption.
- Generic slots stay `PENDING_SCIENTIFIC_REVIEW`.
- Agent answers cite copied V1 metrics or abstain. Fatigue and diagnostic intents abstain.
