# W3.2 — Session evidence adapter

Status: **Implemented as a deterministic engineering adapter; not scientifically validated.** Owner: Linxi. Review partner: Caijia. Contracts: `analysis-session-evidence/0.1`, `session-evidence/0.1`. Decision: [DEC-014](../planning/decision-log.md).

This adapter sits between W3.1 session orchestration and the existing W1–W2 Research Agent tools. It does not add a second Agent runtime, change Caijia-owned algorithms, or create a fatigue score.

```text
Collection / Mission Adapter
→ W3.1 Session Orchestrator
→ W3.2 Evidence Adapter
→ Existing Research Agent Tools
→ Evidence-Grounded Response
```

Related: [session orchestration](session-orchestration.md), [export adapter](analysis-export-adapter.md), [agent tools](agent-tools.md), [data contracts](data-contracts.md).

## Public API

```js
import {
  adaptSessionEvidence,
  createSessionEvidenceStore,
  createSessionEvidenceTools,
  validateSessionEvidenceInput,
} from './analysis/src/neurolens/adapter/index.mjs';

const checked = validateSessionEvidenceInput(session);
const tools = createSessionEvidenceTools(session); // createAnalysisTools({ store })
```

Request `analysis_version` must be `analysis-session-evidence/0.1`. Fixture and export analysis versions remain incompatible with this store.

The wrapper still exposes the three existing read-only tools. It also adds local helpers that do not invent metrics:

| Helper | Result |
|---|---|
| `listEvidence(session_ref)` | Structured evidence items |
| `getTaskSequence(session_ref)` | Ordered task windows |
| `compareWindows(session_ref)` | Descriptive per-task evidence IDs; no fatigue delta |
| `summaryArtifact(session_ref)` | Catalogued artifact, including structure-only records |

## Accepted inputs

- V1 session JSON with `schema_version === '1.0.0'`
- optional `session.orchestration` (`research-session/0.1-provisional`, contract version `0.1.0`)
- optional `session.mission` (`mission-event/0.1-provisional`)
- `{ session, orchestration?, mission? }` objects

V1 Go/No-Go sessions may be adapted with or without a sidecar. Generic multi-slot sessions are accepted only with a matching provisional orchestration protocol. `mission-preview-1` is rejected and is not rewritten as V1.

When a W3.1 sidecar is present, the adapter does not stop at per-event `validateResearchEvent()` checks. It clones the sidecar and runs W3.1 `replayOrchestration()` in event-only mode (`measurement_fidelity: false`). The sidecar is rejected if replay fails, events are out of order, task transitions violate protocol order, observations occur outside an active task, session identity or contract versions mismatch, the replayed terminal state disagrees with the sidecar, or replayed task boundaries disagree with the declared task records. Replay is read-only and does not mutate the submitted artifact.

## Evidence contract

Each evidence item carries:

- stable `evidence_id`
- `session_id`
- `protocol_id` / `protocol_version`
- `task_id` when the item belongs to a task
- `evidence_type`
- `value` / `unit` when a measurement exists; otherwise `null`
- acquisition or observation `window`
- `source`: `camera` / `simulated` / `task-only`
- quality and missingness
- `scientific_review`
- `evidence_contract_version`: `session-evidence/0.1`
- original artifact reference (`session:v1:<id>` or `session:orchestration:<id>`)

Evidence IDs are deterministic and unique within a session. Timeline events use the accepted-event index (`event-<n>`), not a timestamp-only key, so two accepted events with the same `session_elapsed_ms` keep distinct IDs. IDs are stable for identical input and do not use the current time or randomness.

Evidence items are **not** Agent metrics. The only numeric claims `composeAnswer` may make still come from the existing allowlist: `reaction_time_median_ms`, `accuracy`, `valid_trial_count`. Those values are copied from V1 `behavior_summary` only when the protocol is `go-no-go-v1`.

Duplicate `session_ref` values in one store are fail-closed: identical copies keep the first record; conflicting records are rejected and the previous usable artifact is withdrawn.

### Example

```json
{
  "evidence_id": "evidence:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:camera_observation:go-no-go:sample-0",
  "session_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "protocol_id": "go-no-go-v1",
  "protocol_version": "go-no-go/1.0",
  "task_id": "go-no-go",
  "evidence_type": "camera_observation",
  "value": 0.29,
  "unit": "ear_ratio",
  "window": { "start_ms": 120, "end_ms": 120 },
  "source": "camera",
  "quality": { "status": "valid", "missingness": false, "reason_codes": [] },
  "scientific_review": "v1-existing",
  "evidence_contract_version": "session-evidence/0.1",
  "artifact_ref": "session:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
}
```

## Provenance and missingness

| Observation | Adapter behavior |
|---|---|
| Real camera sample | `source: camera`, `evidence_type: camera_observation` |
| Simulated sample | `source: simulated`; Agent limitations say it is not camera evidence |
| Task-only / unavailable vision | ocular items are `missing_measurement` with `value: null` |
| Tracking dropout / no-face | `tracking_dropout`; value stays `null`; not open eyes |
| Generic `slot-a` / `slot-b` | structure only; no PVT or Go/No-Go metrics |
| Pending protocol | `scientific_review: PENDING_SCIENTIFIC_REVIEW`; Agent must not call it validated |

Missing values stay missing. Camera dropout is never coerced into an open-eye observation. Generic-slot sessions return `insufficient_data` rather than invented zeros.

## Agent tool integration

Existing tools:

1. `get_session_summary` — V1 Go/No-Go metrics when present; otherwise `insufficient_data` plus structure limitations.
2. `get_evidence` — catalogued artifact payload, including `evidence_items` and `task_sequence`.
3. `compare_sessions` — allowlisted V1 metrics only when protocol and vision provenance match.

`composeAnswer` reuses `report_metric`, `compare_metric`, and `lookup_artifact`. Additive intents `summarize_structure`, `retrieve_evidence`, `identify_quality`, and `compare_windows` cite evidence IDs or abstain. Fatigue, ADHD, and medical intents still abstain through `UNSUPPORTED_CLAIM`.

Numeric citation validation and prompt-injection request checks are unchanged.

## Privacy

The adapter is local/offline. It does not fetch, upload, or change `sanitizeSession`. Orchestration, mission, and biomedical sidecars stay `local_only` / `upload_eligible: false`. Notes, participant ids, user agents, and withdrawal tokens are redacted from Agent envelopes.

## Scientific limitations

- Not a fatigue predictor or diagnostic classifier.
- Ocular values on evidence items are copied observations, not Caijia-signed metrics.
- W3.1 replay remains event-only (`measurement_fidelity: false`); sidecar observations do not reconstruct EAR.
- Generic slots remain engineering placeholders.
- Successful synthetic tests are not real-camera or scientific validation.

## W3.3 prerequisites

Stop after this adapter until architecture review. W3.3 should not start until the following are explicit:

1. Review of `analysis-session-evidence/0.1` and `session-evidence/0.1`.
2. Decision on whether the HTTP Research Agent demo should accept this analysis version.
3. Caijia review of copied V1 metric identifiers and any future ocular metric allowlist.
4. Signed protocol ids before generic slots can become biomedical task labels.
5. No cloud allowlist, Sites, D1, or paid-provider change from W3.2 alone.

## Caijia review checklist

- [ ] Confirm that copying V1 `behavior_summary` into the existing three metric ids remains acceptable.
- [ ] Confirm that ocular evidence items must stay out of `ALLOWED_METRICS`.
- [ ] Confirm generic `slot-a` / `slot-b` are not treated as PVT or Go/No-Go.
- [ ] Confirm dropout/missingness language: unavailable, not zero, not open eyes.
- [ ] Confirm pending protocols must not be described as validated.
- [ ] Do not treat W3.2 tests as measurement-science sign-off.
