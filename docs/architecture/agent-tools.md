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

Every OK number is backed by an immutable artifact with `artifact_ref`, `analysis_version`, `protocol_version`, `data_origin`, `participant_scope`, `quality`, `payload.metrics`, `limitations`, and `provenance` (`producer`, `producer_version`, `computation: deterministic_fixture_lookup`, `immutable: true`, `inputs`).

W1 `data_origin` is always `synthetic_fixture`. Artifact refs are opaque tokens such as `fixture:session-summary:a`, not URLs or file paths.

## Agent answer (`agent-answer/0.1`)

`status` is `answered | abstained`. Answered claims must repeat the cited artifact's `metric_id`, `value` and `unit`. Abstained answers have empty `claims` and a `reason_code`.

A deterministic `composeAnswer(intent, tools)` composer is the W1 reference implementation. It is not an LLM.

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

## Open contract choices

1. Malformed or unsafe requests use existing status `unavailable` plus `reason_code=rejected_request` rather than a fifth status.
2. Comparison does not emit a derived delta metric; each session value is copied from the fixture.
3. Non-OK responses omit `artifact_ref` when no catalogued failure artifact exists.
4. Metric identifiers are proposed names pending scientific review; they are not new collection schema fields.
