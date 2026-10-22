# W4.2 — Optional orchestration → dataset adapter

Status: **Architecture only. Not implemented.** Owner: Linxi (reader boundary, fail-closed validation, window origin, fingerprints). Review partner: Caijia (protocol meaning; generic slots stay unsigned). Scientific review: **PENDING_SCIENTIFIC_REVIEW**.

This document designs an **optional** versioned reader that, after PR #19 and PR #20 both merge into `develop/neurolens-agent`, can project W3.1 orchestration sidecars into the **frozen W4.1 dataset contracts**. It does not implement the reader. It does not copy unmerged PR #19 runtime. It does not change Caijia-owned scientific definitions.

Planning branch: `feature/w4-2-dataset-readiness`, stacked on reviewed W4.1 SHA `0be8039` (Draft PR #20). Week 3 Draft PR #19 stays open. See [W4.1 freeze](../planning/w4-1-freeze-and-w4-2-readiness.md), [dataset pipeline](dataset-pipeline.md), [DEC-019](../planning/decision-log.md).

```text
W4.1 DATASET PIPELINE: FROZEN (UNMERGED PR #20)
W4.2 ORCHESTRATION READER: DESIGNED, NOT IMPLEMENTED
W3 PR #19: UNMERGED / NOT COPIED
W5: NOT STARTED
REAL-DEVICE VALIDATION: PENDING
SCIENTIFIC REVIEW: PENDING
```

## 1. Compatibility audit

Sources were read in place. PR #19 modules were **not** imported or copied onto this branch. W4.1 currently rejects `session.orchestration` and the other blocked sidecar keys listed in `analysis/src/neurolens/dataset/contracts.mjs`.

### 1.1 What each layer owns

| Layer | Identity | Window source today | Dataset action until W4.2 runtime |
|---|---|---|---|
| V1 export `schema_version` `1.0.0` | `session_id`, `participant_id`, `config.protocol` | Whole-session Go/No-Go fallback | Accept (W4.1) |
| W3.0 `mission-event/0.1-provisional` | Local `session.mission` | `started_session_ms` / `ended_session_ms` | Accept when valid (W4.1) |
| PR #19 `research-session/0.1-provisional` | Local `session.orchestration` | Orchestrator task records with `task_id` | Reject (`unsupported_schema`) |
| PR #19 `research-event/0.1-provisional` | Events on the orchestration timeline | Provenance only | Reject with the sidecar |
| PR #19 `research-protocol/0.1-provisional` | Protocol descriptors, including unsigned `slot-a` / `slot-b` | Not a measurement | Reject; never map to PVT/GNG |
| PR #19 `research-session-replay/0.1-provisional` | Event-only replay, `measurement_fidelity: false` | Timeline equality only | Not a measurement validator |
| PR #19 `w4-session-artifact/0.1-provisional` | Documented ingest wish | — | Superseded by W4.1 dataset contracts; do not import the unmerged file |
| PR #19 `research-session-artifact/0.1-provisional` | `serializeOrchestration` blob | Timeline / state | Insufficient alone (no V1 samples) |
| PR #19 `analysis-session-evidence/0.1` | Agent evidence items | Out of dataset scope | W4.2 does not consume Agent evidence |

V1 remains the collection identity. Sidecars are local engineering metadata (`local_only`, `upload_eligible: false`). Cloud `sanitizeSession` still strips them. Dataset outputs must not reverse that.

### 1.2 Compatibility matrix (reader policy)

| Input | Engineering outcome | Window origin | Scientific eligibility |
|---|---|---|---|
| V1 Go/No-Go only | Accept (W4.1) | `session_fallback` | `pending_review`; protocol review `v1-existing` |
| V1 + valid W3.0 mission tasks | Accept (W4.1) | `mission_sidecar` | Same as W4.1 |
| V1 + malformed / unknown mission | Reject | — | — |
| V1 + `session.orchestration` **before** PR #19 is on develop | Reject (`unsupported_schema`) | — | — |
| V1 + valid orchestration **after** merge, reader enabled | Accept | `orchestration_sidecar` | `pending_review`; unsigned slots stay unsigned |
| V1 + mission + orchestration, **identity 1:1 then agreeing timestamps** | Accept | `orchestration_sidecar` (mission is an identity cross-check, not a second window list) | Same |
| V1 + mission + orchestration, **ambiguous identity, conflicting identity, or disagreeing timestamps** | Reject (`inconsistent_evidence`) | — | — |
| V1 `completed` + orchestration `failed` | Reject | — | — |
| Orchestration artifact without V1 session | Reject (`malformed_output`) | — | — |
| Preview / demo / CSV / simulated behavior | Reject (W4.1) | — | — |
| Unknown sidecar `contract_id` or `contract_version` | Reject (`unsupported_schema`) | — | — |
| Broken sidecar on an otherwise valid V1 body | Reject; do not silently fall back to V1 | — | — |

A broken or unsupported sidecar is never dropped to keep the build green.

### 1.3 Known identity tensions (do not paper over)

1. **Collection protocol vs orchestration protocol.** PR #19 leaves `session/controller.js` as the V1 coordinator. `config.protocol` can remain `go-no-go-v1` while `session.orchestration.protocol_id` is `research-session-sequence/0.1-provisional`. W4.2 must not treat that V1 field as proof that every orchestration slot is Go/No-Go.
2. **`failed` is an orchestration state, not a V1 `session.status` on develop.** V1 allows `completed` | `interrupted`. `completed` + `failed` is rejected (§4.2). Do not rewrite either field. Do not widen V1 status until a merged writer emits `failed` on the V1 record **and** tests the mapping.
3. **Replay is event-only.** `measurement_fidelity` is always `false` on PR #19. Successful replay is not ocular, blink, or EAR validation.
4. **Serialized orchestration artifacts omit V1 samples.** They cannot produce `dataset-observation` rows by themselves.

## 2. Optional reader contract (proposed, not implemented)

Reader id: `dataset-orchestration-read/0.1-provisional`. `contract_version` `0.1.0`. Default `scientific_review` `PENDING_SCIENTIFIC_REVIEW`.

The reader is a **pre-step** in front of frozen W4.1 `validate` / `windows` / `manifest`. It does not fork the dataset JSON shape.

Proposed runtime placement (after merge only):

```text
analysis/src/neurolens/dataset/orchestration.mjs   # optional reader
```

That module may import **develop-canonical** `readSessionArtifact` / `replayOrchestration` / `acceptedTimeline` from `public/collection/session/orchestration-export.js` once those files exist on develop. Until then, W4.1 keeps rejecting the sidecar keys. Do not vendor a copy.

### 2.1 Enablement

| Phase | `--orchestration` (proposed CLI) | Sidecar present |
|---|---|---|
| Now (this branch) | n/a | Reject |
| W4.2 runtime after merge | `auto` (default) | Read; fail closed on error |
| W4.2 runtime after merge | `off` | Reject if sidecar present (do not strip) |

There is no “ignore sidecar and keep V1” mode. Ignoring a present sidecar would hide protocol identity.

### 2.2 Read algorithm

1. Parse as today (`validateExport` / `validateDatasetSession` for V1 identity, sources, summaries, sample timestamps).
2. If `session.orchestration == null`, keep the W4.1 mission-or-fallback path. Stop.
3. Confirm the merged reader symbols exist. If they do not, reject `unsupported_schema` (this branch’s behavior).
4. Call the develop reader. Map its failure kinds:
   - malformed object → `malformed_output`
   - unknown `contract_id` / `contract_version` / event contract → `unsupported_schema`
   - preview → `incompatible_protocol`
5. Require `orchestration.session_id === session.session_id`. Mismatch → `session_mismatch`.
6. Require `orchestration.mode` to match V1 `mode` when both are present.
7. If `replay` is present with `ok === false` or `measurement_fidelity === true`, reject (`inconsistent_evidence` / `unsupported_schema`).
8. Optional integrity gate (default on): run develop `replayOrchestration` in event-only mode on a clone. Failure or `timeline_mismatch` fails the dataset build. Success does **not** set `ocular_observations_present` or change `scientific_eligibility`.
9. Require V1 `status` and orchestration `state` to be compatible under §4.2. Contradictory terminals fail closed. Do not rewrite either field.
10. Derive candidate windows from orchestration task records (`task_id`, `protocol_id`, `kind`, `started_session_ms`, `ended_session_ms`). Apply the **same** W4.1 duration and overlap rules.
11. If `session.mission.tasks` is also non-empty, pair tasks by **identity first** (§2.5), then compare timestamps. Ambiguous or conflicting identity → `inconsistent_evidence`. Do not mix one window list from mission and another from orchestration.
12. Hand the V1 session plus derived window descriptors to the existing W4.1 window assigner. Membership remains:

```text
start_ms <= acquired_elapsed_ms < end_ms
```

Processing timestamps stay provenance only. Late processed, in-window acquisitions stay in-window. Empty windows, unassigned observations, dropout, and missing EAR stay as in W4.1.

### 2.3 Window origin and unsigned slots

| Condition | `window_origin` | `kind` |
|---|---|---|
| No mission, no orchestration, V1 GNG | `session_fallback` | `go-no-go` |
| Valid mission, no orchestration | `mission_sidecar` | GNG or `unsigned-slot` per task `protocol_id` |
| Valid orchestration (after merge) | `orchestration_sidecar` | `go-no-go` iff **that task’s** `protocol_id` is `go-no-go-v1`; else `unsigned-slot` |

`session_fallback` is still not a measured task boundary. `orchestration_sidecar` is also not Caijia-signed science unless the task protocol is already `v1-existing`.

Generic `slot-a` / `slot-b` / `research-session-sequence/0.1-provisional`:

- `kind: unsigned-slot`
- `scientific_review: PENDING_SCIENTIFIC_REVIEW`
- no Go/No-Go trial mapping, no PVT outcomes, no three-rating windows
- session `scientific_eligibility` remains `pending_review`

### 2.4 Additive dataset fields (optional, after runtime)

W4.1 `dataset-session/0.1-provisional` field meanings stay unchanged. W4.2 may add **optional** keys only when the reader actually consumed a sidecar. V1-only and V1+mission builds must remain byte-identical to W4.1 for the same inputs and versions.

Proposed additive keys (not implemented):

| Field | Rule |
|---|---|
| `sidecar_orchestration` | `present` \| `absent` |
| `orchestration_state` | Copied orchestration state when present; not a replacement for V1 `status` |
| `orchestration_protocol_id` | Sidecar protocol id; may differ from `config.protocol` |
| `replay_integrity` | `checked` \| `absent` \| omitted; never `measurement_equivalent` |
| `task_correspondence` | `task_id` \| `unique_kind_protocol` when a mission cross-check ran; omitted otherwise |

`window_origin` may gain the value `orchestration_sidecar`. Fingerprint algorithm, canonical key order, and CLI publication rules stay at W4.1.

If additive keys are introduced, bump a **reader** version (`dataset-orchestration-read/0.1-provisional`) recorded on the manifest (`orchestration_reader_version`). Do not silently change `dataset-validate/0.1-provisional` or `dataset-window/0.1-provisional` semantics.

### 2.5 Task identity correspondence (mission ↔ orchestration)

Matching **timestamps alone is not identity**. When both `session.mission.tasks` and `session.orchestration` task records are present, the reader must establish a 1:1 correspondence **before** comparing `started_session_ms` / `ended_session_ms`. Fail closed if identity cannot be established. Do not infer PVT or Go/No-Go from generic slots in order to make a match.

W3.0 mission task records on develop have `kind`, `protocol_id`, `scientific_review`, `started_session_ms`, `ended_session_ms`, and `reason`. They do **not** carry `task_id`. PR #19 orchestration tasks carry a stable `task_id` plus `kind` and `protocol_id`. Dataset windows keep orchestration `task_id` as the window `task_id` when the sidecar is consumed.

#### Identity keys (in order)

1. **Explicit `task_id`.** If **any** mission task has a non-empty `task_id` (only after a merged writer adds that field), **every** mission task in that session must have one. Each pairs with the unique orchestration task that has the same `task_id`. Zero or multiple hits, or mixing `task_id` rows with `task_id`-less rows in one session → reject (`inconsistent_evidence`).
2. **Unique `(kind, protocol_id)`.** If **no** mission task has `task_id`, pair each only when that `(kind, protocol_id)` appears **exactly once** on the mission list and **exactly once** on the orchestration list. This is the only allowed path for older W3.0 mission records.
3. **No timestamp fallback.** Equal or unique timestamps never create a pair. Two tasks that share `started_session_ms` but disagree on `task_id` / `(kind, protocol_id)` are rejected.

After a 1:1 pairing exists:

- Compare `started_session_ms` and `ended_session_ms` (null ends allowed only under §4.2 interrupted rules). Any disagreement → reject.
- Compare `kind` and `protocol_id` on the paired rows. Disagreement → reject.
- `protocol_id === 'go-no-go-v1'` is required on **that paired task** before Go/No-Go trial mapping. Generic `slot-a` / `slot-b` / `PENDING_SCIENTIFIC_REVIEW` stay `unsigned-slot`.
- Unpaired leftover tasks on either side → reject (counts must match after pairing).
- Duplicate orchestration `task_id` values → reject before pairing.

#### Older mission records without matching identifiers

| Mission shape | Orchestration shape | Result |
|---|---|---|
| No `session.mission.tasks` (empty/absent) | Orchestration present | No cross-check; windows from orchestration only |
| Tasks with unique `(kind, protocol_id)` (typical single V1 GNG mission) | One matching orchestration task | Pair by that identity, then check timestamps |
| Tasks with `task_id` that match 1:1 | Matching `task_id`s | Pair by `task_id`, then check timestamps |
| Two generic slots with the same `(kind, protocol_id)` and no `task_id` | `slot-a` / `slot-b` | **Reject** — identity is ambiguous |
| Mission GNG + orchestration unsigned slot, even with equal timestamps | Different `(kind, protocol_id)` | **Reject** — identity disagrees |
| Any mission task that cannot be paired uniquely | Any | **Reject** — do not drop the sidecar, do not fall back to V1/mission-only windows |

The dataset window `task_id` is always the orchestration `task_id` when the orchestration sidecar is the window source. Mission-only W4.1 builds are unchanged (`task_id` synthesized as today).

## 3. Replay integrity

| Check | Fail closed |
|---|---|
| Sidecar `replay.ok === false` | Yes |
| `measurement_fidelity === true` | Yes (unsupported on the proposed W3.1 contract) |
| Optional re-run of `replayOrchestration` disagrees with stored timeline | Yes (`inconsistent_evidence`) |
| Duplicate event identity (same `type` + index collision after `acceptedTimeline`) | Yes |
| Out-of-order `session_elapsed_ms` on accepted events | Yes |
| Observation events whose acquisition time is outside the active task | Yes, if the merged replay already rejects them; do not invent a second rule |

Replay **does not**:

- reconstruct EAR, blink, or closed-time
- fill missing samples
- mark `ocular_observations_present`
- change `scientific_eligibility` to anything other than `pending_review`

## 4. Duplicates, interruption, failure, privacy

### 4.1 Duplicates

Unchanged from W4.1 at session grain: identical canonical session JSON (including sidecars) keeps the first; conflicting `session_id` fails the build (`session_mismatch` / `inconsistent_evidence`).

Additional sidecar rules (after merge):

- duplicate `task_id` inside one orchestration protocol → reject
- two accepted events that compare equal under `acceptedTimeline` → reject (`inconsistent_evidence`)
- orchestration `session_id` ≠ V1 `session_id` → `session_mismatch`

### 4.2 Terminal-state compatibility (V1 status × orchestration state)

V1 `session.status` on develop is `completed` | `interrupted`. PR #19 orchestration `state` also includes `failed` and non-terminal `created` | `ready` | `running`. The reader **copies both fields** when it accepts a record. It never rewrites V1 `status` to match orchestration, and never rewrites orchestration `state` to match V1.

Default: **reject contradictory terminals** (`inconsistent_evidence`). Failed and interrupted records stay scientifically unsigned (`scientific_eligibility: pending_review`; `usable_for_behavior` false unless the V1 protocol is `go-no-go-v1` **and** V1 status is `completed` **and** orchestration state is `completed`).

Open-task rules from W4.1 still apply after this matrix: V1 `completed` cannot carry a null task `end_ms`; V1 `interrupted` may.

| V1 `status` | Orchestration `state` | Dataset action | Notes |
|---|---|---|---|
| `completed` | `completed` | Accept | Both terminals agree. Windows must be closed. |
| `interrupted` | `interrupted` | Accept | Keep open tasks; membership `< duration_ms`. No completion claim. Unsigned scientifically. |
| `interrupted` | `failed` | Accept | Compatible **non-success** pair. Copy both states. Do not rewrite either. `usable_for_behavior` false. Unsigned scientifically. Record `orchestration_state: failed` if the additive field exists. |
| `completed` | `failed` | **Reject** | Contradictory. A failed orchestration is not a completed V1 session. Allowed later **only** if a merged writer contract defines this mapping **and** a regression test on develop covers it. Until then, fail closed. |
| `completed` | `interrupted` | **Reject** | Contradictory terminals. |
| `interrupted` | `completed` | **Reject** | Contradictory terminals. |
| `completed` or `interrupted` | `created` / `ready` / `running` | **Reject** | Sidecar is not terminal; do not treat a finished V1 export as having an in-flight orchestrator. |
| `failed` (V1) | `failed` | Accept only after a merged V1 writer emits `status: failed` | Unusable for ocular/behavior products; keep windows that exist; never claim completion. Unsigned scientifically. |
| `failed` (V1) | `interrupted` or `completed` | **Reject** | No mapping unless a merged writer contract defines and tests it. |
| any | missing sidecar | W4.1 only | No orchestration state to compare. |

Do not fabricate later protocol tasks after interruption or failure. Do not coerce `failed` into `interrupted` or `completed` to keep the build green.

### 4.3 Privacy

Same W4.1 redaction: drop `environment`, `notes`, `events` (V1 notes stream), `video`, `withdrawal_token`, `upload_token`, `user_agent`.

Additionally, when projecting orchestration:

- do not copy protocol descriptor `notes` (free text)
- do not copy rejected-event payloads that may contain environment fields
- do not copy Agent evidence items
- do not upload sidecars; dataset JSON is a local research artifact, not a new cloud DTO
- `participant_ref` remains the browser alias

## 5. Fingerprints and W4.1 preservation

- Same V1 / V1+mission inputs and W4.1 versions → **byte-identical** `dataset.json` / `manifest.json` after W4.2 lands.
- Enabling the orchestration reader on inputs that contain a sidecar is a **different input** and must change `input_fingerprint` / `output_fingerprint`.
- No `Date.now()`, `Math.random()`, network, D1, Sites, or OpenAI in the reader.
- Publication remains stage-then-rename; refuse non-empty `--out` without `--replace`.

## 6. Migration after PR #19 and PR #20 merge

Do **not** merge this stacked branch while PR #20 is unmerged. It contains W4.1 commits.

Approved sequence:

1. Review PR #19 and PR #20 independently. Do not cherry-pick either into the other.
2. Merge them into `develop/neurolens-agent` in the order maintainers accept (they do not block each other).
3. Rebase `feature/w4-2-dataset-readiness` onto the merged develop head. Resolve only documentation drift; do not re-copy Week 3 modules (they will already be on develop).
4. Implement `orchestration.mjs` against develop imports. Add synthetic fixtures that match the **merged** sidecar shape, not a private fork.
5. Keep W4.1 tests green and add the §7 matrix as `tests/dataset-orchestration.test.mjs`.
6. Stop for review before W5. No statistics, plots, ML, or scientific eligibility changes.

If PR #20 receives review fixes after this planning SHA, rebase this branch onto the updated W4.1 SHA explicitly.

Rollback: if the merged sidecar contract changes `contract_id` or `contract_version`, fail closed until the reader allowlist is updated. Do not accept “close enough” sidecars.

## 7. Integration test matrix (planned, not implemented)

Synthetic fixtures only. Do not add these tests until the contracts exist on develop.

| # | Case | Expected |
|---|---|---|
| 1 | V1 GNG, no sidecars | Unchanged W4.1 byte-identical output |
| 2 | V1 + mission only | Unchanged W4.1 windows / fingerprints |
| 3 | Orchestration present before develop has the reader | Reject (current W4.1) |
| 4 | After merge: V1 + valid GNG orchestration | `window_origin: orchestration_sidecar`; GNG trials map only to GNG tasks |
| 5 | After merge: unsigned `slot-a` / `slot-b` | `kind: unsigned-slot`; no trial mapping; eligibility `pending_review` |
| 6 | Mission and orchestration agree by unique identity, then timestamps | Accept; one window list; window `task_id` from orchestration |
| 7 | Paired identity, disagreeing start/end | Reject `inconsistent_evidence` |
| 8 | Orchestration `session_id` ≠ V1 | Reject `session_mismatch` |
| 9 | Unknown orchestration `contract_id` / version | Reject `unsupported_schema` |
| 10 | Malformed events array | Reject `malformed_output` |
| 11 | Duplicate orchestration `task_id` | Reject |
| 12 | Duplicate / conflicting session JSON | Keep identical first; conflict fails build |
| 13 | `replay.ok === false` | Reject |
| 14 | Replay timeline mismatch on optional re-run | Reject |
| 15 | Claimed `measurement_fidelity: true` | Reject |
| 16 | V1 `interrupted` + orchestration `interrupted`, open task | Keep; no completion claim; unsigned |
| 17 | V1 `completed` + open orchestration task | Reject |
| 18 | V1 `interrupted` + orchestration `failed` | Accept non-success pair; rewrite neither; `usable_for_behavior` false; unsigned |
| 19 | Late processed, in-window acquisition | Assigned (W4.1 rule) |
| 20 | Exclusive end | Unassigned `post_task` |
| 21 | Privacy: no notes / UA / tokens / protocol notes | Redacted |
| 22 | Serialized orchestration artifact alone | Reject |
| 23 | `--orchestration off` with sidecar present | Reject (do not strip) |
| 24 | Deterministic repeat with sidecar | Byte-identical |
| 25 | No network / no D1 / no OpenAI | Same as W4.1 |
| 26 | **P1 regression:** V1 `completed` + orchestration `failed` | Reject; do not rewrite either state |
| 27 | **P1 regression:** V1 `completed` + orchestration `interrupted` | Reject |
| 28 | **P1 regression:** V1 `interrupted` + orchestration `completed` | Reject |
| 29 | **P1 regression:** V1 terminal + orchestration `running`/`ready`/`created` | Reject |
| 30 | **P1 regression:** equal timestamps, disagreeing `(kind, protocol_id)` or `task_id` | Reject; timestamps are not identity |
| 31 | **P1 regression:** two mission generic slots without `task_id`, identical `(kind, protocol_id)` | Reject as ambiguous; no PVT/GNG inference |
| 32 | **P1 regression:** older mission GNG without `task_id`, unique `(kind, protocol_id)` match, timestamps agree | Accept; window `task_id` from orchestration |
| 33 | **P1 regression:** older mission cannot pair uniquely | Reject; do not fall back to timestamp or V1-only windows |

## 8. W4.2 implementation plan (runtime, later)

| Slice | After merge | Not in slice |
|---|---|---|
| **W4.2.0** (this document) | Architecture, matrix, DEC-019, migration | Runtime code, tests that fake merged contracts |
| **W4.2.1** | `orchestration.mjs` importing develop export helpers; CLI `auto`/`off`; reject unknown versions | Scientific slot mapping |
| **W4.2.2** | Identity-first mission/orchestration pairing; terminal-state matrix; optional replay gate | Timestamp-only matching; measurement replay |
| **W4.2.3** | Unsigned-slot windows, additive sidecar fields, §7 synthetic tests including P1 regressions 26–33, fingerprint lock vs W4.1 | W5 models, D3 stats, PR merges |

Acceptance for W4.2.1–.3: W4.1 tests still pass; V1-only fingerprints match W4.1; sidecar cases match §7; no PR #19 files copied by hand.

## 9. Non-goals

- No copy or cherry-pick of unmerged PR #19.
- No merge of PR #19, PR #20, or this branch.
- No W5, no ML, no Python validator, no ocular pooling, no PERCLOS threshold.
- No change to `sanitizeSession`, Go/No-Go trial code, or camera algorithms.
- No treating generic slots as PVT or Go/No-Go.
- No using event-only replay as blink/EAR proof.
- No new cloud allowlist or sidecar upload.
