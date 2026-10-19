# Evidence-grounded agent tools (W1)

Status: **Implemented as deterministic scaffolding; not an LLM runtime and not scientifically validated.** Owner: Linxi. Review partner: Caijia. Contract source: proposed [W1 agent contract](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/1).

This module is the first vertical slice of [DEC-003](../planning/decision-log.md). The agent may only consume allowlisted, read-only analysis tools and immutable artifacts. It must copy numbers from those artifacts or abstain.

## Boundary

- In: opaque `session_ref` / `artifact_ref`, allowlisted `metric_id`, version tokens.
- Out: versioned tool envelopes and agent answers with claim-to-artifact citations.
- Not in scope: camera streams, raw frames, participant identity, cloud tokens, production D1, filesystem/SQL/URL retrieval, fatigue scores, ADHD or medical conclusions.

Implementation lives under `analysis/src/neurolens/agent/`. Collection, consent and deployment paths are unchanged.

## Tools (`agent-tools/0.1`)

| Tool | Request | OK result |
|---|---|---|
| `get_session_summary` | `{ session_ref, analysis_version }` | Metrics plus `artifact_ref` |
| `compare_sessions` | `{ session_refs, metric_id, analysis_version }` | Per-session metrics for one metric |
| `get_evidence` | `{ artifact_ref }` | Catalogued artifact payload |

`status` is `ok | unavailable | incompatible | insufficient_data`. Non-OK responses include `reason_code` and an empty `metrics` array. Rejected requests never query the catalog; they return `unavailable` / `rejected_request`.

## Evidence artifact (`evidence-artifact/0.1`)

Every OK number is backed by an immutable artifact with `artifact_ref`, `analysis_version`, `protocol_version`, `data_origin`, `participant_scope`, `quality`, `payload.metrics`, `limitations`, and `provenance` (`producer`, `producer_version`, `computation` of `deterministic_fixture_lookup` or `deterministic_export_normalization`, `immutable: true`, `inputs`).

Fixture catalogs use `data_origin: synthetic_fixture`. Offline export artifacts use the additive origin `session_export` and analysis version `analysis-export/0.1`; the two analysis versions are incompatible. Artifact refs are opaque tokens such as `fixture:session-summary:a` or `export:session-summary:<uuid>`, not URLs or file paths.

## Agent answer (`agent-answer/0.1`)

`status` is `answered | abstained`. Answered claims must repeat the cited artifact's `metric_id`, `value` and `unit`. Abstained answers have empty `claims` and a `reason_code`.

A deterministic `composeAnswer(intent, tools)` composer is the W1 reference implementation. It is not an LLM. The manual prompt/eval harness in [agent-eval.md](agent-eval.md) uses that composer as a hidden gold baseline and never treats ChatGPT output as trusted without `validateAgentAnswer`.

## Proposed metrics (pending Caijia review)

| `metric_id` | Unit | Existing collection field |
|---|---|---|
| `reaction_time_median_ms` | `ms` | `behavior_summary.median_reaction_ms` |
| `accuracy` | `proportion` | `behavior_summary.accuracy` |
| `valid_trial_count` | `count` | `behavior_summary.valid_trial_count` |

Protocol compatibility is exact-version match unless listed in `PROTOCOL_COMPATIBILITY`. W1 fixtures use `fixture-protocol/0.1` and an intentionally incomparable `fixture-protocol/0.2`.

## Example OK envelope

```json
{
  "contract_version": "agent-tools/0.1",
  "tool": "get_session_summary",
  "status": "ok",
  "analysis_version": "analysis-fixture/0.1",
  "artifact_ref": "fixture:session-summary:a",
  "protocol_version": "fixture-protocol/0.1",
  "data_origin": "synthetic_fixture",
  "participant_scope": "single_pseudonymous_participant",
  "quality": { "usable": true, "reason_codes": [] },
  "metrics": [
    { "metric_id": "reaction_time_median_ms", "value": 320, "unit": "ms", "n": 12 }
  ],
  "limitations": ["Synthetic fixture; not a fatigue diagnosis and not empirical evidence."]
}
```

## W1.2 hardening

- Cited artifacts must belong to the requested session when `expectedSessionRefs` is provided.
- OK tool envelopes are checked against the cited artifact for `artifact_ref`, versions, provenance, quality and metrics.
- Every OK `artifact_ref` returned by `compare_sessions` is catalogued and retrievable via `get_evidence`.
- Fixture artifacts are deep-frozen. Extra fields on public envelopes are rejected.

`validateAgentAnswer(..., { expectedSessionRefs, coverage })` defaults to intersection (`coverage: 'any'`). Comparison answers pass `coverage: 'all'` so cited artifacts together must include every requested session.

Offline V1 JSON → artifact mapping is documented in [analysis-export-adapter.md](analysis-export-adapter.md). W3.2 adds an additive analysis version `analysis-session-evidence/0.1` and evidence-item payload fields; see [session-evidence-adapter.md](session-evidence-adapter.md). Metric identifiers remain proposed names pending Caijia review.

## Open contract choices

1. Malformed or unsafe requests use existing status `unavailable` plus `reason_code=rejected_request` rather than a fifth status.
2. Comparison does not emit a derived delta metric; each session value is copied from the fixture.
3. Non-OK responses omit `artifact_ref` when no catalogued failure artifact exists.
4. Metric identifiers are proposed names pending scientific review; they are not new collection schema fields.
