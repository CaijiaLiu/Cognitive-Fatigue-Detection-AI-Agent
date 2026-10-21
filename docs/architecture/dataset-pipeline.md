# W4.0 / W4.1 — Dataset architecture and deterministic pipeline

Status: **W4.0 architecture designed. W4.1 Node validator / window builder / CLI implemented against synthetic fixtures.** Owner: Linxi (engineering contracts, validator, window builder, CLI). Review partner: Caijia (protocol meaning, ocular interpretation, estimands, exclusion thresholds). Scientific review: **PENDING_SCIENTIFIC_REVIEW**.

This document specifies a deterministic, fail-closed biomedical **research data** pipeline. It does not produce fatigue scores, ADHD probabilities, or clinical labels. Passing synthetic tests is not real-camera or scientific validation.

Branch: `feature/w4-dataset-pipeline` from `develop/neurolens-agent` @ `3b7528f`. Week 3 Draft PR #19 stays open and is **not** merged or cherry-picked.

```text
W4.0 DATASET ARCHITECTURE: DESIGNED
W4.1 VALIDATOR / WINDOW BUILDER: IMPLEMENTED (SYNTHETIC TESTS)
W3 PR #19: UNMERGED / NOT COPIED
REAL-DEVICE VALIDATION: PENDING
SCIENTIFIC REVIEW: PENDING
```

Related: [data contracts](data-contracts.md), [data flow](data-flow.md), [export adapter](analysis-export-adapter.md), [mission adapter](mission-adapter.md), [features](../research/features.md), [protocols](../research/protocols.md), [north star D1–D3](../planning/research-north-star.md), [DEC-016](../planning/decision-log.md).

## 1. Audit — what is on develop vs PR #19

### Available on `develop/neurolens-agent` (W3.0)

| Contract / surface | Location | Dataset use |
|---|---|---|
| V1 `schema_version` `1.0.0` | `public/collection/session/versions.js` | Primary session identity |
| `go-no-go-v1` | `config.protocol`, `docs/research/protocols.md` | Only signed behavioral protocol |
| Sample quality flags | `FeatureAccumulator`: `valid`, `no_face`, `eyes_unavailable`, `tracking_gap`, `closed_eyes` | Missingness vocabulary |
| Acquisition vs processing | `acquired_elapsed_ms` / `processed_elapsed_ms` on samples when present; else `elapsed_ms` | Window membership vs provenance |
| Dropout ≠ open eyes | `noteDropout` / `tracking_gap`; `MAX_TRACKING_GAP_MS = 250` | Gap marker, not a scientific threshold to recompute |
| Task window (live) | Mission adapter `currentWindow()`: `[started, ended)` on **acquisition** time | Boundary rule to reuse |
| `mission-event/0.1-provisional` | `session.mission` local sidecar | Optional task offsets; `local_only`; not a cloud DTO |
| Offline export adapter | `analysis/src/neurolens/adapter/` | Session-level metric copy for the Agent, **not** a dataset/window builder |
| `sanitizeSession` | `lib/research/validation.mjs` | Unchanged; strips `mission`; statuses `completed` / `interrupted` |

V1 session fields the dataset reader must preserve: `session_id`, `participant_id`, `started_at`, `ended_at`, `duration_ms`, `status`, `mode`, `sources`, `consent`, `fatigue_pre` / `fatigue_post`, `config`, `calibration`, `samples`, `blink_events`, `trials`, `behavior_summary`, `vision_summary`. Wall-clock dates identify the session; monotonic elapsed milliseconds own events.

### Not on develop — proposed on unmerged PR #19

Do **not** copy these modules onto this branch. W4 may later consume them only after review/merge.

| Contract | PR #19 role | W4 stance until merge |
|---|---|---|
| `research-protocol/0.1-provisional` | Generic protocol descriptors; `slot-a` / `slot-b` unsigned | Reject unknown protocol ids; do not treat generic slots as PVT/GNG |
| `research-session/0.1-provisional` | Orchestration sidecar + state machine | Optional future input; fail closed if present but unreadable on develop |
| `research-event/0.1-provisional` | Timeline events with acquisition/processing | Same |
| `research-session-replay/0.1-provisional` | Event-only replay, `measurement_fidelity: false` | Not a measurement validator |
| `w4-session-artifact/0.1-provisional` | Documented ingest boundary on PR #19 | Replaced/extended by this dataset contract; do not import the unmerged file |
| `analysis-session-evidence/0.1` | Agent evidence adapter | Out of W4.1 scope (Agent, not dataset) |
| `research-session-integration/0.1-provisional` | Offline E2E composition | Out of W4.1 scope |

### Explicitly rejected inputs (already true on develop)

- `mission-preview-1` / `mission-exploratory-v1`
- `mode === 'demo'`
- CSV exports as a dataset source
- Simulated behavior or ratings
- Production D1 as an implicit input
- Participant video/photos

## 2. Dataset contracts (implemented in W4.1 as `0.1-provisional`)

All dataset contracts are versioned `name/0.1-provisional`, `contract_version` `0.1.0`, default `scientific_review` `PENDING_SCIENTIFIC_REVIEW`, `local_only` true for any sidecar-derived field. Units and timestamps are copied, never rescaled.

### 2.1 Dataset manifest — `dataset-manifest/0.1-provisional`

One immutable JSON object per build:

| Field | Rule |
|---|---|
| `contract_id` / `contract_version` | Required |
| `dataset_id` | Stable slug from config, not a random UUID |
| `created_from` | Sorted list of input file fingerprints |
| `input_fingerprint` | SHA-256 of canonical concatenated input bytes |
| `output_fingerprint` | SHA-256 of `stableStringify({ sessions, windows, observations, trials, manifest })` **excluding** this field; written back in a second pass |
| `feature_definition_version` | `feature-dictionary/0.1` (existing docs only) |
| `window_algorithm_version` | `dataset-window/0.1-provisional` |
| `validator_version` | `dataset-validate/0.1-provisional` |
| `collection_schema_version` | `1.0.0` |
| `allowed_protocols` | Default `['go-no-go-v1']` |
| `allowed_modes` | `camera`, `simulated`, `behavior` |
| `mixing_policy` | `stratify_by_vision_source` — never silently pool camera with simulated ocular rows |
| `participant_split_key` | `participant_id` |
| `scientific_review` | `PENDING_SCIENTIFIC_REVIEW` |
| `counts` | Sessions, windows, observations, exclusions by reason |
| `local_only_sidecars_present` | Boolean; true if any `session.mission` was read |

W4.1 fingerprint rule: write payload without `output_fingerprint`, hash `stableStringify(payload)`, then set the field. Repeat builds with the same inputs and versions are byte-identical.

### 2.2 Session record — `dataset-session/0.1-provisional`

Normalized, redaction-safe projection of one V1 session:

| Field | Source | Notes |
|---|---|---|
| `session_id` | V1 UUID | Primary key |
| `participant_ref` | V1 `participant_id` | Browser-pseudonymous; **not** a verified person |
| `group_key` | `participant_ref` | Grouped split key |
| `protocol_id` / `protocol_version` | `config.protocol` | `go-no-go-v1` / `1.0.0` on develop |
| `scientific_review` | `v1-existing` iff protocol is `go-no-go-v1`, else pending |
| `scientific_eligibility` | Always `pending_review` in W4.1 unless a separately accepted scientific contract says otherwise |
| `engineering_valid` | `true` only for records that passed structural/provenance checks |
| `camera_source_present` | `mode === 'camera'` and `sources.vision === 'camera'` |
| `ocular_observations_present` | `true` only when `camera_source_present` and at least one observation has `source: camera`, `quality: valid`, and finite EAR. Simulated and task-only rows cannot set this flag. Not a coverage threshold. |
| `mode` / `sources` | V1 | Vision must match mode |
| `status` | `completed` \| `interrupted` | `failed` only after a future merged contract defines it |
| `started_at` / `ended_at` | ISO wall clock | Identity, not event time |
| `duration_ms` | V1 | Session-elapsed domain |
| `task_windows` | See §4 | Derived, not invented tasks |
| `provenance` | `camera` / `simulated` / `task-only` | From mode |
| `missingness` | Counts of quality flags | Preserve, do not impute |
| `usable_for_ocular` | `camera_source_present && ocular_observations_present` | Presence check, not a coverage threshold; simulated never trains ocular models |
| `usable_for_behavior` | Protocol `go-no-go-v1` and human trials | Independent of vision |
| `sidecar_mission` | Present / absent | Copied offsets only |

Do not copy `environment.user_agent`, notes, withdrawal tokens, or upload tokens into dataset outputs.

### 2.3 Task window — `dataset-window/0.1-provisional`

| Field | Rule |
|---|---|
| `window_id` | `window:<session_id>:<task_id>:<start_ms>` |
| `session_id` / `task_id` | Required |
| `protocol_id` | Copied; unsigned ids stay pending |
| `kind` | `go-no-go` or `unsigned-slot` |
| `start_ms` / `end_ms` | Session-elapsed; `end` may be null if interrupted mid-task |
| `window_origin` | `mission_sidecar` when W3.0 tasks exist; otherwise `session_fallback` for V1 Go/No-Go |
| `bound` | `[start_ms, end_ms)` on **acquisition** time |
| `status` | `completed` / `interrupted` / `empty` |
| `observation_count` | Assigned samples |
| `trial_count` | Trials whose `onset_ms` is in the window (GNG only) |
| `scientific_review` | `v1-existing` or `PENDING_SCIENTIFIC_REVIEW` |

Generic or `PENDING_SCIENTIFIC_REVIEW` protocol ids **must** set `kind: 'unsigned-slot'` and must not be mapped to PVT or Go/No-Go trial semantics.

### 2.4 Feature observation — `dataset-observation/0.1-provisional`

Copied sample row plus window membership:

| Field | Rule |
|---|---|
| `observation_id` | `obs:<session_id>:<index>` |
| `acquired_elapsed_ms` | `sample.acquired_elapsed_ms` if finite, else `elapsed_ms` |
| `processed_elapsed_ms` | Copied when present; **not** used for window membership |
| `window_id` | Assigned window or `null` if unassigned |
| `unassigned_reason` | `pre_task` / `post_task` / `no_window` / `null` |
| `source` | Must equal `session.sources.vision` |
| `quality` | Existing flag set only |
| `eye_aspect_ratio` / `gaze_x` / `gaze_y` / `face_present` / `eyes_closed` | Copied; null stays null |
| `units` | EAR ratio; gaze is eye-width normalized, **not** screen gaze |

No new ocular metric is derived in W4.0/W4.1. Window coverage fractions may be **counted** (`valid_count / duration`) as engineering QA, not as Caijia-signed PERCLOS.

### 2.5 Missingness and quality

Reuse the collection vocabulary. Do not add thresholds.

| Flag | Meaning in the dataset |
|---|---|
| `valid` | Face present and finite EAR |
| `no_face` | Face not present; not closed eyes |
| `eyes_unavailable` | Face present, EAR missing |
| `tracking_gap` | Dropout / gap; **not** open eyes |
| `closed_eyes` | Existing accumulator closed state; not a blink confirmation |
| `empty_window` | Window exists, zero assigned observations |
| `unassigned_observation` | Observation exists, no window |

Missing values stay missing. Zero is not a fill.

### 2.6 Participant / group identity

- `participant_ref` = V1 `participant_id` (UUID).
- It links sessions from one **browser profile**, not a verified unique human (device change ⇒ new id).
- `group_key` for any future split is `participant_ref`. Windows from one session never cross groups.
- Conflict: two records with the same `session_id` and different `participant_id`, mode, protocol, or `started_at` → reject the dataset build.
- Identical duplicate `session_id` (canonical JSON equal) → keep first.
- Do not invent a second identity namespace in W4.1.

### 2.7 Source provenance

Each session and each observation carries `vision`: `camera` | `simulated` | `unavailable`. Dataset-level mixing policy:

- A cohort **may** contain multiple modes.
- Ocular QA and any later ocular feature tables **must** be stratified; camera and simulated rows are never concatenated as one ocular matrix.
- A single session whose samples disagree with `sources.vision` is rejected (`inconsistent_evidence`).

### 2.8 Protocol version

| Protocol | On develop | Dataset action |
|---|---|---|
| `go-no-go-v1` `1.0.0` | Yes | Accept; `scientific_review: v1-existing` |
| Mission task `protocol_id` other than `go-no-go-v1` | Sidecar may carry `PENDING_SCIENTIFIC_REVIEW` | Keep as unsigned slot; no trial mapping |
| `mission-exploratory-v1` | Preview | Reject |
| Unmerged W3 generic sequence | PR #19 only | Reject until that contract is on develop |

### 2.9 Scientific review status

Allowed values: `v1-existing` | `PENDING_SCIENTIFIC_REVIEW`. Dataset outputs that include unsigned slots or simulated vision must list that in `manifest.limitations`. Engineering-complete dataset builds are not scientific validation.

## 3. Validation architecture

Validator id: `dataset-validate/0.1-provisional`. Deterministic, no I/O besides caller-supplied parsed JSON. Fail closed: one blocking error fails the build unless the CLI is explicitly run with `--report-only` (still must not write a “usable” dataset).

| Case | Action | `reason_code` |
|---|---|---|
| Invalid / unknown schema | Reject | `unsupported_schema` |
| Missing required identity/time/protocol | Reject | `malformed_output` |
| Duplicate `session_id` with conflicting body | Reject | `inconsistent_evidence` |
| Identical duplicate `session_id` | Keep first | — |
| Participant identity conflict on same session | Reject | `session_mismatch` |
| Non-finite, negative, or inverted timestamps | Reject | `malformed_output` |
| `acquired_elapsed_ms` > `processed_elapsed_ms` | Reject that observation | `future_acquisition` |
| Task-window overlap | Reject session | `inconsistent_evidence` |
| Window `end_ms` < `start_ms` | Reject session | `malformed_output` |
| Task `start_ms` / `end_ms` outside `[0, duration_ms]` (`start` must be `< duration_ms`; finite `end` must be `<= duration_ms`) | Reject session | `malformed_output` |
| Completed session with open-ended task (`end_ms` null) | Reject session | `malformed_output` |
| Interrupted session with open-ended task | Accept; membership uses `< duration_ms` | — |
| Unsupported protocol | Reject session | `incompatible_protocol` |
| Preview schema/protocol | Reject | `incompatible_protocol` |
| Sample source ≠ `sources.vision` | Reject | `inconsistent_evidence` |
| Simulated behavior/ratings | Reject | `rejected_request` |
| Dropout labeled as open eyes | Reject if `interpreted_as_open_eyes: true` | `inconsistent_evidence` |
| Mixed camera/simulated **inside one session** | Reject | `inconsistent_evidence` |
| Mixed camera/simulated **across a cohort** | Accept, stratify; ocular pool forbidden | recorded in manifest |
| CSV / path / URL input | Reject | `rejected_request` |

`behavior_summary` vs `summarizeTrials(trials)` must agree for `go-no-go-v1`, same as the W1.4 export adapter.

## 4. Windowing design

Algorithm id: `dataset-window/0.1-provisional`.

### 4.1 Derive windows

1. If `session.mission.tasks` is a non-empty array with finite `started_session_ms`:
   - One window per task, `start_ms = started_session_ms`, `end_ms = ended_session_ms` (nullable if still open / interrupted).
   - Offsets must lie in the session elapsed domain: `0 <= start_ms < duration_ms`; finite `end_ms` must satisfy `start_ms <= end_ms <= duration_ms`.
   - `end_ms` may be null only when `session.status === 'interrupted'`. Completed sessions with an open task are rejected.
   - Sort by `start_ms`, then `task_id`.
   - Overlap if `start_i < end_j && start_j < end_i` (treat null end as `+∞` for overlap detection) → reject.
2. Else if `config.protocol === 'go-no-go-v1'`:
   - Single window `task_id = 'go-no-go'`, `kind = 'go-no-go'`, `[0, duration_ms)`.
3. Else reject (`incompatible_protocol`).

Do not synthesize PVT blocks, rest phases, or three-rating windows.

### 4.2 Associate observations

Membership uses **acquisition time only**:

```text
start_ms <= acquired_elapsed_ms < end_ms
```

- **Inclusive start, exclusive end** — matches W3.0 `classifyResult` (`acquisitionTs < started` ⇒ `pre_task`; `acquisitionTs >= ended` ⇒ `post_task`).
- If `end_ms` is null (interrupted open task), membership is `acquired_elapsed_ms >= start_ms` and `< session.duration_ms`.
- Exactly one matching window required. Overlaps are already rejected. Zero matches → `window_id = null` + `unassigned_reason`.
- **Processing time** is stored, never used for ownership.
- **Late callbacks:** processed after `end_ms` but acquired inside the window **belong to the window**.
- **Missing intervals:** `tracking_gap` samples remain in-window if their acquisition time is in-window; they do not become open-eye observations.
- **Empty windows:** kept. `status = empty`, `observation_count = 0`.
- **Interrupted sessions:** keep windows that started; do not fabricate later protocol tasks; session `status` stays `interrupted`.
- **Failed sessions:** not a V1 status on develop. If a future merged contract introduces `failed`, treat the session as unusable, copy windows that exist, and never claim completion.

Trials (GNG): assign by `onset_ms` with the same `[start, end)` rule. Invalid trials remain in the window with `invalid_reason` preserved.

## 5. Reproducibility

| Mechanism | Rule |
|---|---|
| Runtime | Node, existing `analysis/` tree. No new Python backend in W4.1. Caijia D3 statistics may later read the JSON. |
| CLI | `node analysis/src/neurolens/dataset/cli.mjs build --in <json...> --out <dir>` |
| Clock / RNG | None in the builder. No `Date.now()`, no `Math.random()`. |
| Ordering | Sessions by `session_id`; windows by `(session_id, start_ms, task_id)`; observations by `(session_id, acquired_elapsed_ms, index)` |
| Canonical JSON | Sorted keys (same `stableStringify` idea as other analysis code) |
| Input fingerprint | SHA-256 over canonical bytes of each input, then over the sorted list |
| Output manifest | Written with versions, fingerprints, counts, limitations |
| Feature definitions | Pin `feature-dictionary/0.1`; do not compute new ocular features |
| QA summary | Counts by mode, status, quality flag, unsigned protocol, empty window, unassigned observation |
| Network | No fetch, D1, Sites, or OpenAI |

Repeated runs with the same inputs and versions must byte-match.

## 6. Module layout (W4.1)

```text
analysis/src/neurolens/dataset/
  contracts.mjs     # frozen contract ids and allowed enums
  validate.mjs      # fail-closed session/dataset checks
  windows.mjs       # derive + assign
  manifest.mjs      # fingerprints, counts, limitations, buildDataset
  redaction.mjs     # strip notes / UA / tokens
  cli.mjs           # deterministic build entry
  index.mjs         # public exports
analysis/fixtures/datasets/synthetic.mjs
tests/dataset-pipeline.test.mjs
docs/architecture/dataset-pipeline.md   # this file
```

CLI exit codes: `0` success, `2` usage error (including refusing to overwrite a non-empty `--out` without `--replace`), `3` validation failure, `1` unexpected I/O. `--report-only` prints counts/fingerprint to stdout without writing a usable dataset directory.

Publication strategy (atomic pair):

1. Validate the full dataset in memory. Do not touch `--out` until the payload is complete.
2. If `--out` exists and is non-empty, refuse unless `--replace`.
3. Write both `dataset.json` and `manifest.json` into a sibling staging directory (`.nl-dataset-staging-<name>-*`).
4. Publish by renaming the staging directory onto `--out`. Empty existing directories are swapped the same way so a new dataset cannot pair with an old manifest.
5. `--replace` retires the previous directory, then renames staging into place. If the publish rename fails, the retired directory is restored.
6. Staging directories are deleted after failures. A failed replace does not delete the retired copy until restore succeeds.

This refuses mixed-generation artifacts: a new `dataset.json` is never left beside an old success `manifest.json`.

Reuse `validateV1Session` / `summarizeTrials` / mission `readCompatibleSession`. Do not import unmerged PR #19 modules. Do not change `sanitizeSession`, Go/No-Go, or camera algorithms.

## 7. Test matrix (W4.1)

Covered by `tests/dataset-pipeline.test.mjs` with synthetic fixtures only.

| # | Case | Expected |
|---|---|---|
| 1 | Valid V1 GNG camera session | One `[0, duration)` window; metrics agree with `summarizeTrials` |
| 2 | Valid V1 + mission sidecar, non-overlapping tasks | Windows from sidecar offsets |
| 3 | Invalid schema / missing fields / unmerged sidecar | Reject |
| 4 | Missing identity | Reject |
| 5 | Duplicate sessions | Identical body kept once; conflicting participant rejected |
| 6 | Invalid / inverted timestamps | Reject |
| 7 | Overlapping task windows | Reject |
| 8 | Unsupported / preview protocol | Reject |
| 9 | Dropout / missing EAR stay missing | No zero fill; gap ≠ open eyes |
| 10 | Mixed sources inside one session | Reject |
| 11 | Camera + simulated in one cohort | Accept; stratified; no pooled ocular table |
| 12 | Late processed, in-window acquisition | Assigned to window |
| 13 | Acquisition at exclusive end | Unassigned `post_task` |
| 14 | Empty window | Kept, counted |
| 15 | Interrupted session | Status interrupted; no completed claim |
| 16 | Fallback window origin | `window_origin: session_fallback`; not a measured task boundary |
| 17 | Camera present without valid ocular data | `camera_source_present` true; `ocular_observations_present` false |
| 18 | Engineering vs scientific eligibility | `engineering_valid` true; `scientific_eligibility` `pending_review` |
| 19 | Deterministic repeat | Byte-identical output |
| 20 | CLI fail-closed | Invalid or mixed valid+invalid writes no dataset |
| 21 | Privacy | No notes / UA / tokens in dataset JSON |
| 22 | No network | `fetch` unused |
| 23 | Transaction-safe CLI publication | Existing `--out` refused without `--replace`; injected write failure leaves no mixed pair and cleans staging |
| 24 | Task window boundaries | Out-of-range start/end rejected; completed open-ended tasks rejected; interrupted open tasks kept |
| 25 | Ocular provenance | Simulated/task-only/`closed_eyes` cannot set `ocular_observations_present`; requires camera + `quality: valid` |

Synthetic fixtures only. Not real-camera validation.

## 8. Integration dependencies and risks

| Dependency | Status | Risk if ignored |
|---|---|---|
| V1 export JSON | On develop | None for W4.1 |
| W3.0 mission sidecar | On develop, optional | Windows fall back to whole-session GNG |
| PR #19 orchestration / evidence | Unmerged | Do not cherry-pick; optional later reader |
| Caijia protocol / PVT / probes | Unsigned | Unsigned slots stay unsigned |
| Ocular metric meaning | Unsigned | Counts only; no new algorithms |
| `participant_id` semantics | Browser alias | Over-split or under-merge people |
| Sprint text saying “Python validator” | Conflicts with JS analysis tree | W4.1 stays Node; D3 stats may be Python later |
| Cloud allowlist | Unchanged | Sidecars must not upload |

## 9. Scientific ownership

| Topic | Owner |
|---|---|
| Window membership algorithm, fingerprints, CLI | Linxi |
| GNG trial semantics, PVT, ratings, probes | Caijia |
| EAR / blink / PERCLOS / gaze interpretation | Caijia |
| Exclusion thresholds beyond copied quality flags | Caijia |
| Whether camera vs simulated may ever be pooled | Caijia (currently: no ocular pooling) |
| Estimands, repeated-measures stats, plots | Caijia D3, after W4.1 JSON exists |

## 10. Implementation milestones

| Slice | Scope | Not in scope |
|---|---|---|
| **W4.0** | Architecture, contracts, test matrix, DEC-016 | Runtime code |
| **W4.1** (this slice) | Node validator + window builder + CLI + 25 synthetic tests | Statistics, plots, ML, PR #19 code |
| **W4.2** | If PR #19 merges: optional orchestration sidecar reader | Treating generic slots as science |
| **D3** | Caijia statistics on the JSON dataset | Engineering inventing estimands |

W4.1 CLI acceptance: from synthetic fixtures, `node analysis/src/neurolens/dataset/cli.mjs build --in <files...> --out <dir>` writes `dataset.json` and `manifest.json` whose `output_fingerprint` is stable and whose exclusion counts match the test table.

## 11. Non-goals

- No Python service or notebook as the validator.
- No merge of Week 3.
- No change to Caijia algorithms or V1 `schema_version`.
- No `sanitizeSession` expansion.
- No automatic sidecar upload or new consent.
- No fabricated camera measurements.
- No fatigue / diagnostic dataset labels.
