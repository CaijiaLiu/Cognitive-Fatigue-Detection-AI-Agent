# W1.4 — Offline session-export adapter

Status: **Implemented as a deterministic engineering slice; not scientifically validated.** Owner: Linxi. Review partner: Caijia. Depends on the PR #2 agent-tool contract. This document does not change collection, consent, cloud, or mission preview runtime.

The adapter consumes **already-exported** Focus Lab / NeuroLens V1 session JSON, produces immutable analysis artifacts, and injects them into the existing read-only tool interface via `createAnalysisTools({ store })`. It does not open production D1, read camera streams, or rewrite participant records.

Related: [data contracts](data-contracts.md), [data flow](data-flow.md), [agent tools](agent-tools.md), [DEC-003](../planning/decision-log.md), [PR #2 tools](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/2), [PR #3 design](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/3).

## Confirmation gate (2026-10-19)

PRs #1, #2 and #3 are draft and have **no reviews**. Caijia has not confirmed:

1. the scientific meaning of `reaction_time_median_ms`, `accuracy`, and `valid_trial_count`;
2. whether camera and simulated-vision sessions may be compared;
3. the citation `coverage: 'all'` rule as a scientific comparison requirement.

W1.4 therefore implements an **engineering copy** of the three metric identifiers already allowlisted in PR #2, plus contract-independent accept/reject validation. Additional collected fields remain unmapped. Copied numbers are not a measurement-science review.

## Public API

```js
import { createExportAnalysisTools, createExportStore, validateExport } from './analysis/src/neurolens/adapter/index.mjs';

const checked = validateExport(parsedJson);
const store = createExportStore(parsedJson);          // or an array of parsed documents
const tools = createExportAnalysisTools(parsedJson);  // createAnalysisTools({ store })
```

`createExportStore` exposes the same methods PR #2 already uses: `getSession`, `getArtifact`, `summaryRefFor`, `comparisonRefFor`.

| Call | Result |
|---|---|
| `get_session_summary` | Allowlisted behavioral metrics plus `artifact_ref` |
| `compare_sessions` | Per-session copied metrics when protocol and vision provenance match |
| `get_evidence` | Catalogued artifact payload |

Request `analysis_version` must be `analysis-export/0.1`. Fixture tools still require `analysis-fixture/0.1`; the two versions are incompatible.

## Supported inputs

Accept only parsed JSON:

- a single V1 session object with `schema_version === '1.0.0'` and `config.protocol === 'go-no-go-v1'`;
- a local bundle `{ schema_version, exported_at, sessions }`;
- a researcher-style bundle that also has `next_cursor`.

Accepted modes: `camera`, `simulated`, `behavior` (task-only). `sources.behavior` must be `human` and `sources.ratings` must be `self_report`. `sources.vision` must match mode (`camera` / `simulated` / `unavailable`). Sample `source` values must match `sources.vision`.

Committed synthetic examples live in `analysis/fixtures/exports/`. They are not real participant exports.

## Rejected inputs

| Condition | Tool status | `reason_code` |
|---|---|---|
| Not JSON / CSV / not a plain object | `unavailable` | `rejected_request` |
| `schema_version` missing | `unavailable` | `malformed_output` |
| Unknown `schema_version` | `incompatible` | `unsupported_schema` |
| `mission-preview-1` or preview protocol | `incompatible` | `incompatible_protocol` |
| `mode === 'demo'` or simulated behavior/ratings | `unavailable` | `rejected_request` |
| `sources.vision` disagrees with `mode` or sample `source` | `incompatible` | `inconsistent_evidence` |
| Required identity/time/`behavior_summary` missing | `unavailable` | `malformed_output` |
| Stored summary ≠ `summarizeTrials` on the same trials | `unavailable` | `inconsistent_evidence` |
| Zero valid trials / no copyable allowlisted metrics | `insufficient_data` | `insufficient_data` |
| File paths, URLs, extra request fields | `unavailable` | `rejected_request` |

CSV is rejected. The adapter never fetches `/api/research/export` or opens D1.

## Mapping actually implemented

Engineering copy only. Scientific review is still open.

| Source field | `metric_id` | Unit | Missingness |
|---|---|---|---|
| `behavior_summary.median_reaction_ms` | `reaction_time_median_ms` | `ms` | Omit the metric when null; do not impute |
| `behavior_summary.accuracy` | `accuracy` | `proportion` | Omit when null |
| `behavior_summary.valid_trial_count` | `valid_trial_count` | `count` | Session is `insufficient_data` when 0 or missing |

`n` is the observation count that produced the stored number when trials are present: correct valid Go RTs for median RT; valid trials otherwise.

### Blocked mapping decisions

Do **not** treat these as agent-visible until Caijia confirms definitions, units and comparison rules:

- all other `behavior_summary` fields (mean/SD RT, go/no-go accuracy, omissions, false alarms, anticipations);
- `fatigue_pre` / `fatigue_post`;
- every `vision_summary` / blink / gaze / head-motion field;
- mission-preview PVT fields;
- whether simulated-vision *behavioral* numbers may later be pooled with camera sessions (this slice refuses that comparison).

Ocular nulls are never converted to zero.

## Contract tokens added (additive)

| Check | Fixture (unchanged) | Export |
|---|---|---|
| `data_origin` | `synthetic_fixture` | `session_export` |
| `provenance.computation` | `deterministic_fixture_lookup` | `deterministic_export_normalization` |
| `analysis_version` | `analysis-fixture/0.1` | `analysis-export/0.1` |
| `protocol_version` | `fixture-protocol/0.x` | `go-no-go/1.0` with raw `go-no-go-v1` in provenance |
| Answer citation | `coverage` defaults to `'any'` | `composeAnswer` comparison uses `coverage: 'all'` |

`session_ref` is `export:session:<uuid>`. Artifact refs are `export:session-summary:<uuid>` and `export:compare:<uuid>:<uuid>:<metric_id>`. Paths and URLs remain rejected.

The original export object is frozen as a sidecar (`source_export_sha256`). Normalization never writes back to the caller's object. Artifacts omit `participant_id`, `user_agent`, `notes`, `events`, `video` and withdrawal/upload tokens.

## Files

| Path | Responsibility |
|---|---|
| `analysis/src/neurolens/adapter/validate-export.mjs` | Fail-closed V1 JSON accept/reject |
| `analysis/src/neurolens/adapter/normalize.mjs` | ID aliasing, redaction, origin/quality codes |
| `analysis/src/neurolens/adapter/to-artifact.mjs` | Allowlisted fields → `evidence-artifact/0.1` |
| `analysis/src/neurolens/adapter/store.mjs` | Read-only store for `createAnalysisTools({ store })` |
| `analysis/src/neurolens/adapter/index.mjs` | Public `createExportAnalysisTools` |
| `analysis/fixtures/exports/` | Synthetic, de-identified example JSON only |
| `tests/analysis-adapter.test.mjs` | W1.3 acceptance tests |
| `analysis/src/neurolens/agent/constants.mjs` + `validate.mjs` | Additive origin/computation/coverage tokens |

Out of scope: collection modules, consent, D1, camera, mission preview port, LLM provider, CSV writer changes.

## What this does not establish

Successful tool retrieval of copied V1 summaries is an engineering integration. It is not blink-accuracy validation, not fatigue-prediction performance, not protocol-science sign-off, and not a deployed analysis service.
