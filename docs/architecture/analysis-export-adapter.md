# W1.3 — Session-export adapter for evidence-grounded agent tools

Status: **Proposed design, not implemented.** Owner: Linxi. Review partner: Caijia. Depends on the PR #2 agent-tool contract remaining the public LLM-facing boundary. This document does not change collection, consent, cloud, or mission preview runtime.

The next coding PR should consume **already-exported** Focus Lab / NeuroLens session JSON, produce immutable analysis artifacts, and inject them into the existing read-only tool interface. It must not open production D1, read camera streams, or rewrite participant records.

Related: [data contracts](data-contracts.md), [data flow](data-flow.md), [features](../research/features.md), [protocols](../research/protocols.md), [DEC-003](../planning/decision-log.md), [PR #1 contract](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/1), [PR #2 tools](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/2).

## 1. Data inventory

### 1.1 Where session data lives

| Store | Identity | Writer | Reader | Agent-adapter use |
|---|---|---|---|---|
| Browser IndexedDB `focus-lab-v1` / object store `sessions` | `session_id` | `public/collection/persistence/local.js` | History UI, local JSON/CSV export | **Out of band.** Adapter reads an export file the researcher already saved, not live IndexedDB. |
| `localStorage` `focus-lab-participant` | Browser-scoped UUID | `participantId()` | Session constructor | Do **not** read. Treat as a linkable research identifier, not a verified person. |
| Local JSON / CSV download | File chosen by the user | `session/controller.js` + `reporting/export.js` | Human / future adapter | **Primary adapter input.** Prefer JSON. |
| Optional cloud D1 `research_sessions.payload` | Sanitized session JSON | `lib/research/validation.mjs` `sanitizeSession` after separate upload consent | Researcher dashboard `/api/research/export` | **Not an adapter source.** Do not query production or local D1 from the agent path. |
| Mission preview IndexedDB `focus-lab-mission-preview-v1` | Separate key + participant key | preview `663ed79` | Preview-only export | **Unsupported** until a coordinated schema/consent gate. Fail closed. |

Local save writes the full in-browser session record. Cloud upload strips `environment`, `events`, and `notes` before `sanitizeSession`. Researcher export paginates 10 D1 rows and reuses the same `exportRows` / `toCSV` helpers.

### 1.2 Export structures that already exist

**Single-session JSON** (`focus-lab-<id12>.json`): `JSON.stringify(selected)` of the IndexedDB record.

**All-session JSON bundle:**

```json
{
  "schema_version": "1.0.0",
  "exported_at": "<ISO-8601>",
  "sessions": [ /* full local records */ ]
}
```

**Researcher JSON** (private dashboard): `{ schema_version, exported_at, next_cursor, sessions }` where each session is the allowlisted cloud DTO plus `received_at`.

**CSV kinds** from `exportRows(sessions, kind)`:

| `kind` | Row grain | Fields |
|---|---|---|
| `sessions` | one row per session | identity, sources, consent version, duration, `fatigue_pre` / `fatigue_post`, then flattened `vision_summary` and `behavior_summary` keys |
| `samples` | one row per visual sample | `session_id`, `participant_id`, `vision_source`, `behavior_source`, plus sample fields |
| `trials` | one row per trial | same session/source prefixes plus trial fields |

CSV is lossy: nested `config`, `calibration`, `consent`, `blink_events`, `quality` arrays, and local-only `events` / `notes` are not reconstructed. The adapter should **reject CSV as a primary input** and ask for JSON. A later optional CSV reader may be added only if every required field is present and missingness is explicit.

### 1.3 Implemented V1 session record (schema `1.0.0`)

Identity and provenance:

- `schema_version`: `1.0.0`
- `session_id`, `participant_id`: UUID strings
- `started_at`, `ended_at`: ISO-8601 wall clock
- `duration_ms`, `status`: `completed` \| `interrupted` (cloud also requires these)
- `mode`: `camera` \| `simulated` \| `behavior` (local demo uses `demo` and is not a cloud DTO)
- `sources.vision`: `camera` \| `simulated` \| `unavailable`
- `sources.behavior`: `human` (demo may be `simulated`)
- `sources.ratings`: `self_report` (demo may be `simulated`)
- `consent.version` (`v1-2026-10-10` locally), `consent.accepted_at`
- `upload_consent` only after optional upload (`upload-v1`)
- `config.protocol`: `go-no-go-v1`
- `config`: `planned_duration_ms`, `response_window_ms`, `go_probability`, `vision_sample_hz`, `ear_baseline`, `close_ratio`, `open_ratio`, `max_gap_ms` (local also stores inter-trial range, blink range, timing note)
- `calibration`: `source` `camera` \| `simulated`, `ear_baseline`, optional frame size/count

Behavioral trial fields (`tasks/go-no-go.js`): `index`, `type` (`go` \| `no-go`), `onset_ms`, `deadline_ms`, `response_ms`, `reaction_ms`, `responded`, `correct`, `invalid_reason`, `source`.

`behavior_summary` (`tasks/summary.js`): `trial_count`, `valid_trial_count`, `invalid_trial_count`, `accuracy`, `go_accuracy`, `no_go_accuracy`, `median_reaction_ms`, `mean_reaction_ms`, `reaction_sd_ms`, `omissions`, `false_alarms`, `anticipations`.

Ocular sample fields (`features/accumulator.js`): `elapsed_ms`, `source`, `face_present`, `eye_aspect_ratio`, `eyes_closed`, `gaze_x`, `gaze_y`, `head_rotation`, `quality` (`no_face` \| `eyes_unavailable` \| `tracking_gap` \| `closed_eyes` \| `valid`).

`blink_events`: `start_ms`, `duration_ms` (80–800 ms closed-to-open).

`vision_summary`: `blink_count`, `blink_rate_per_min`, `closed_time_ms`, `closed_fraction`, `valid_tracking_ms`, `tracking_coverage`, `head_motion_deg_per_sec`, `gaze_position_sd_eye_width`, `mean_blink_duration_ms`, `sample_count`.

Task-only mode writes `nullVision()`: ocular counts/rates/fractions are `null`, `valid_tracking_ms` is `0`, `sample_count` is `0`.

Self-report: `fatigue_pre`, `fatigue_post` integers 1–10. Not window labels and not a diagnosis.

Local-only (stripped before cloud): `environment` (includes `user_agent`), `events`, `notes`. Never copy these into agent artifacts.

### 1.4 Mission preview differences (unsupported input)

Reviewed snapshot `663ed79` / `preview/mission-live-camera-v0.3`:

| Topic | Main V1 | Mission preview |
|---|---|---|
| Schema | `1.0.0` | `mission-preview-1` |
| Protocol | `go-no-go-v1` | session `mission-exploratory-v1`; per-task `pvt-web-exploratory-v1` or `go-no-go-v1-game-skin` |
| Presentation | none | `mission-en-v0.3-live-eyes`, live-feedback flag |
| Storage | `focus-lab-v1` | `focus-lab-mission-preview-v1` |
| Participant key | `focus-lab-participant` | `focus-lab-mission-participant` |
| Tasks | one Go/No-Go | `tasks[]`: 3 min PVT-inspired + 4 min Go/No-Go (demo 20 s each) |
| Ratings | `fatigue_pre` / `fatigue_post` | `ratings.{pre,between,post}` + `rating_events` |
| Upload | optional, allowlisted | `upload_consent=false`; not a main cloud DTO |
| Extra PVT summaries | absent | `mean_response_speed_per_sec`, `slowest_10pct_mean_ms`, `false_starts`, `responses_ge_500ms` |

Do not coerce preview records into schema `1.0.0` or drop the between-rating. The first adapter version must return `incompatible` for `mission-preview-1`.

### 1.5 What is not collected (do not invent)

Screen gaze / dwell, blendshapes, thought probes, confounder questionnaire, validated PERCLOS, blink-interval analysis, hardware saccades/pupil, ADHD or fatigue *scores*, and any PVT field on **main** exports.

## 2. Field-to-metric mapping

PR #2 allowlists only three metrics. The adapter’s first slice must emit **those three** and no new scientific quantities. Other collected summaries may be copied later after Caijia review; they are listed so we do not pretend they are already agent-visible.

### 2.1 First-slice allowlist (compatible with PR #2)

| Existing source field | Proposed `metric_id` | Unit | Data type | Missingness handling | Required transformation | Scientific interpretation limits |
|---|---|---|---|---|---|---|
| `behavior_summary.median_reaction_ms` | `reaction_time_median_ms` | `ms` | finite number or `null` | If `null` or no correct valid Go RTs → `insufficient_data` for this metric; do not impute | Copy the stored summary. Optional integrity recompute via `summarizeTrials` must match or fail closed | Median of **correct valid Go** trials only. Browser onset timing is an estimate. Not a PVT-B score and not a fatigue score. |
| `behavior_summary.accuracy` | `accuracy` | `proportion` | number in `[0, 1]` or `null` | `null` when `valid_trial_count === 0` → `insufficient_data` | Copy. Do not treat invalid/interrupted trials as errors | Correct valid trials / valid trials. Invalid trials stay outside the denominator. |
| `behavior_summary.valid_trial_count` | `valid_trial_count` | `count` | non-negative integer | Always present on a well-formed V1 summary; missing field → fail closed | Copy | Count of trials without `invalid_reason`. Not “good performance.” |

`n` on each metric should be the number of observations that produced it: correct Go RTs for median RT; valid trials for accuracy; valid trials for `valid_trial_count`.

### 2.2 Collected but not yet agent-allowlisted

These exist on V1 exports. Do **not** add them to the W1.3 coding PR unless the allowlist is explicitly extended.

| Source field | Candidate `metric_id` | Unit | Notes / limits |
|---|---|---|---|
| `behavior_summary.mean_reaction_ms` | `reaction_time_mean_ms` | `ms` | Same Go-correct subset; more outlier-sensitive than the median |
| `behavior_summary.reaction_sd_ms` | `reaction_time_sd_ms` | `ms` | Sample SD; small `n` is unstable |
| `behavior_summary.go_accuracy` / `no_go_accuracy` | `go_accuracy` / `no_go_accuracy` | `proportion` | Null if that trial class is empty |
| `behavior_summary.omissions` / `false_alarms` / `anticipations` | matching `_count` ids | `count` | Anticipations are valid trials with RT `< 100` ms |
| `behavior_summary.trial_count` / `invalid_trial_count` | matching ids | `count` | Context for missingness, not performance claims |
| `fatigue_pre` / `fatigue_post` | `fatigue_rating_pre` / `fatigue_rating_post` | `rating_1_to_10` | Self-report labels, **not** predictors and not a diagnosis |
| `vision_summary.blink_count` | `blink_count` | `count` | ~10 Hz sampling can miss short blinks |
| `vision_summary.blink_rate_per_min` | `blink_rate_per_min` | `per_min` | Per **valid tracked** minute; null if `valid_tracking_ms < 1000` |
| `vision_summary.closed_time_ms` / `closed_fraction` | matching ids | `ms` / `proportion` | **Not** validated PERCLOS |
| `vision_summary.valid_tracking_ms` / `tracking_coverage` | matching ids | `ms` / `proportion` | Coverage vs planned duration; gaps are not zero movement |
| `vision_summary.head_motion_deg_per_sec` | `head_motion_deg_per_sec` | `deg_per_sec` | Relative angular travel; not pitch/yaw/roll events |
| `vision_summary.gaze_position_sd_eye_width` | `iris_position_sd_eye_width` | `eye_width` | Uncalibrated iris-width proxy; **not** screen gaze |
| `vision_summary.mean_blink_duration_ms` | `mean_blink_duration_ms` | `ms` | From 80–800 ms events only |
| `vision_summary.sample_count` | `vision_sample_count` | `count` | Includes no-face / gap samples |

Ocular candidate metrics are usable only when `sources.vision === 'camera'` **and** quality/coverage thresholds pass. `simulated` vision must keep `data_origin` / quality reason `simulated_vision` and must not be summarized as camera evidence. `unavailable` / task-only must not convert `null` ocular fields to `0`.

### 2.3 Version tokens the adapter must emit

PR #2 `VERSION_PATTERN` is `name/major.minor` (for example `fixture-protocol/0.1`). Raw collection `go-no-go-v1` does **not** match.

| Collection field | Agent field (proposed) | Original preserved in provenance |
|---|---|---|
| `schema_version` `1.0.0` | `collection_schema_version` on artifact payload | exact string |
| `config.protocol` `go-no-go-v1` | `protocol_version` `go-no-go/1.0` | `source_protocol: go-no-go-v1` |
| (none today) | `analysis_version` `analysis-export/0.1` | distinct from `analysis-fixture/0.1` |
| `sources.*`, `mode` | `data_origin` `session_export` plus quality reason codes | never rewrite `simulated` → `camera` |

## 3. Adapter architecture

```text
Versioned session export JSON
        │
        ▼
  validateExport()          fail closed: schema, shape, sources, demo, mission-preview
        │
        ▼
  normalizeSession()        alias IDs, drop environment/notes/events, keep originals aside
        │
        ▼
  buildEvidenceArtifact()   copy allowlisted metrics; immutable provenance
        │
        ▼
  ExportArtifactStore       read-only catalog, same shape as PR #2 fixture store
        │
        ▼
  createAnalysisTools({ store })
```

### 3.1 Principles

1. **Preserve the original export** as an immutable input blob or sidecar (`source_export_sha256`, `source_schema_version`). Normalization never overwrites the file.
2. **Copy, then optionally verify.** Do not replace stored `behavior_summary` with a silent recompute. If a verifier runs and disagrees, return `inconsistent_evidence`.
3. **Fail closed** on unsupported schema/protocol, missing required fields, demo provenance, mission-preview records, mixed camera/simulated samples, or null required metrics.
4. **Never substitute simulated values** for camera values, and never fill ocular nulls with zeros.
5. **Dependency injection only.** PR #2 already accepts `{ store }`. The adapter is a second store implementation, not a second tool API.
6. **Offline / local files only.** No `fetch` to D1, no camera, no filesystem glob from tool arguments. The caller passes already-parsed JSON.
7. **Privacy.** Do not place `participant_id`, `user_agent`, notes, or withdrawal tokens on artifacts. `session_ref` is `export:session:<session_id>` (opaque, not a path).

### 3.2 Validation gate

Accept only:

- a single V1 session object with `schema_version === '1.0.0'` and `config.protocol === 'go-no-go-v1'`, or
- a bundle whose `sessions[]` all pass that check.

Reject (no metrics):

| Condition | Tool status | `reason_code` |
|---|---|---|
| Not JSON / not a plain object | `unavailable` | `rejected_request` |
| `schema_version` missing or unknown | `incompatible` | `unknown_analysis_version` or a dedicated `unsupported_schema` if added |
| `mission-preview-1` or preview protocol | `incompatible` | `incompatible_protocol` |
| `mode === 'demo'` or `sources.behavior === 'simulated'` | `unavailable` | `rejected_request` / `insufficient_data` |
| `sources.vision` disagrees with `mode` or sample `source` | `incompatible` | `inconsistent_evidence` |
| Required identity/time/summary fields missing | `unavailable` | `malformed_output` |
| Requested metric is `null` | `insufficient_data` | `insufficient_data` |

### 3.3 Normalization

Keep a `source` object (frozen copy of the accepted export, minus `environment` / `notes` / `events` / any `video` key). Emit:

```text
session_ref          export:session:<uuid>
protocol_version     go-no-go/1.0
analysis_version     analysis-export/0.1
data_origin          session_export
participant_scope    single_pseudonymous_participant
quality.usable       true only if requested metrics are finite and provenance is consistent
quality.reason_codes simulated_vision | unavailable_vision | low_coverage | missing_feature | ...
```

`computation` must become an allowlist, not the single W1 fixture string (see §4).

### 3.4 Store and tools

`createExportStore(parsedExports)` exposes the same methods PR #2 already uses: `getSession`, `getArtifact`, `summaryRefFor`, `comparisonRefFor`. Comparison artifacts are built only for sessions that share `protocol_version` and have usable requested metrics. `get_evidence` must retrieve every `artifact_ref` the store returns.

Do not change tool names, request keys, or answer schema in the first adapter PR.

## 4. Compatibility and contract risks

### 4.1 Session-bound citation is not comparison coverage

PR #2 `validateAgentAnswer(..., { expectedSessionRefs })` accepts a citation when **any** requested session appears in `artifact.source_session_refs`:

```text
expectedSessionRefs.some(sessionRef => sources.includes(sessionRef))
```

That is **intersection**, not **coverage**.

| Rule | Meaning | Current W1.2 |
|---|---|---|
| Intersection | A cited artifact refers to *at least one* requested session | Implemented |
| Coverage | The cited evidence together includes *every* session required for the comparison | **Not implemented** |

Safe today for `report_metric` (one session). Unsafe for a future LLM `compare_metric` over sessions A and B: a claim can cite an artifact that only contains A, as long as A is in `expectedSessionRefs`. Numeric fidelity still blocks inventing B’s number *unless* that number also exists on A’s artifact (possible once more metrics share values).

**Smallest safe adjustment (do not implement in this docs PR):**

1. Add `coverage: 'any' | 'all'` to `validateAgentAnswer` options. Default `'any'` preserves current single-session tests.
2. When `coverage === 'all'`, the union of cited `source_session_refs` must include every `expectedSessionRefs` entry; otherwise `session_mismatch`.
3. `composeAnswer` for `compare_metric` (and the export adapter’s comparison path) passes `{ expectedSessionRefs, coverage: 'all' }`.
4. Keep per-metric `session_ref` on comparison artifacts so each number stays bound to one session.

No fifth tool status is required.

### 4.2 Additive contract tokens required before real exports can pass PR #2 validators

These are fail-closed blockers, not silent loosenings:

| Check today | Blocker for real exports | Additive change |
|---|---|---|
| `data_origin === synthetic_fixture` | Real exports are not fixtures | Allow `session_export` |
| `provenance.computation === deterministic_fixture_lookup` | Adapter is a different computation | Allow `deterministic_export_normalization` |
| `analysis_version === analysis-fixture/0.1` for OK responses | Must not mix fixture and export analyses | Allow `analysis-export/0.1`; keep them incompatible with each other |
| `protocol_version` must match `name/x.y` | Collection stores `go-no-go-v1` | Emit `go-no-go/1.0` and keep the raw string in provenance |

Do not widen `REF_PATTERN` to file paths or URLs.

### 4.3 Privacy and scientific risks

- `participant_id` is a **browser-linkable** identifier. Adapter artifacts must not echo it.
- Local JSON may contain `environment.user_agent` and free-text `notes` / `events`. Drop them.
- Researcher JSON is still in-scope only if a human already exported it; the adapter does not call `/api/research/export`.
- Simulated ocular features are labeled today; the adapter must keep that label. They cannot support empirical ocular claims.
- `closed_fraction` and `gaze_*` keep their V1 meanings. The adapter must not rename them into PERCLOS or screen gaze.
- Fatigue ratings are outcomes, not agent “fatigue scores.”
- Mission-preview PVT fields are **not** on main exports; do not add them to the V1 allowlist.

## 5. Recommended implementation files (next coding PR only)

Do not create empty placeholders in this documentation change.

| Path | Responsibility |
|---|---|
| `analysis/src/neurolens/adapter/validate-export.mjs` | Fail-closed V1 JSON accept/reject |
| `analysis/src/neurolens/adapter/normalize.mjs` | ID aliasing, redaction, origin/quality codes |
| `analysis/src/neurolens/adapter/to-artifact.mjs` | Map allowlisted fields → `evidence-artifact/0.1` |
| `analysis/src/neurolens/adapter/store.mjs` | Read-only store compatible with `createAnalysisTools({ store })` |
| `analysis/src/neurolens/adapter/index.mjs` | Public `createExportAnalysisTools(parsed)` |
| `analysis/fixtures/exports/` | Synthetic, de-identified example JSON only (no real participant exports) |
| `tests/analysis-adapter.test.mjs` | Acceptance tests below |
| `analysis/src/neurolens/agent/constants.mjs` + `validate.mjs` | Additive origin/computation/coverage tokens only |

Out of scope for that PR: collection modules, consent, D1, camera, mission preview port, LLM provider, CSV writer changes.

## 6. Acceptance tests for the next coding PR

Use committed **synthetic** exports that look like schema `1.0.0`, not live IndexedDB or production D1.

1. **Known V1 camera-or-behavior export:** `get_session_summary` copies `median_reaction_ms`, `accuracy`, `valid_trial_count` exactly; units and `n` match; `data_origin` is `session_export`; `protocol_version` is `go-no-go/1.0`; original `go-no-go-v1` remains in provenance.
2. **Task-only / unavailable vision:** ocular candidate fields stay `null` / unused; behavioral metrics still copy; no zero-fill.
3. **Simulated vision:** artifact quality records `simulated_vision`; agent limitations state the numbers are not camera evidence; comparison with a camera session is `incompatible` or abstains.
4. **Missing RT / zero valid trials:** `insufficient_data`, empty `metrics`, no imputed fatigue label.
5. **Mission preview JSON** (`schema_version: mission-preview-1`): `incompatible`, no field coercion to V1 pre/post.
6. **Demo session:** rejected before artifact construction.
7. **Unknown schema or missing `behavior_summary`:** fail closed.
8. **Integrity mismatch:** if stored median ≠ `summarizeTrials` on the same trials, `inconsistent_evidence`.
9. **Compare two `go-no-go/1.0` exports:** per-session metrics copied; `get_evidence` retrieves the comparison `artifact_ref`; `validateAgentAnswer` with `coverage: 'all'` passes only when both session refs are cited.
10. **Compare V1 vs preview or vs fixture-protocol:** `incompatible_protocol`.
11. **Citation coverage:** an answer that cites only session A while `expectedSessionRefs` is `[A, B]` and `coverage: 'all'` is `session_mismatch`.
12. **Privacy:** normalized artifacts contain no `participant_id`, `user_agent`, `notes`, `events`, or upload/withdrawal tokens.
13. **No network / no D1:** repeated adapter runs are byte-identical; `fetch` is not called.
14. **PR #2 fixtures still pass** `npm test` unchanged for `analysis-fixture/0.1`.
15. **Unsafe refs:** file paths, URLs, and extra fields are `rejected_request` as in W1.2.

## 7. Out of scope for W1.3 implementation

LLM providers, real-device validation, mission integration, cloud allowlist changes, and any claim that copied summaries are clinically or scientifically validated. Insufficient or simulated data remains a valid reason to abstain.
