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
| V1 + mission + orchestration, **agreeing** boundaries | Accept | `orchestration_sidecar` (mission used as cross-check) | Same |
| V1 + mission + orchestration, **disagreeing** boundaries or identity | Reject (`inconsistent_evidence`) | — | — |
| Orchestration artifact without V1 session | Reject (`malformed_output`) | — | — |
| Preview / demo / CSV / simulated behavior | Reject (W4.1) | — | — |
| Unknown sidecar `contract_id` or `contract_version` | Reject (`unsupported_schema`) | — | — |
| Broken sidecar on an otherwise valid V1 body | Reject; do not silently fall back to V1 | — | — |

A broken or unsupported sidecar is never dropped to keep the build green.

### 1.3 Known identity tensions (do not paper over)

1. **Collection protocol vs orchestration protocol.** PR #19 leaves `session/controller.js` as the V1 coordinator. `config.protocol` can remain `go-no-go-v1` while `session.orchestration.protocol_id` is `research-session-sequence/0.1-provisional`. W4.2 must not treat that V1 field as proof that every orchestration slot is Go/No-Go.
2. **`failed` is an orchestration state, not a V1 `session.status` on develop.** V1 allows `completed` | `interrupted`. Do not widen V1 status until a merged writer actually emits `failed` on the V1 record.
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
9. Derive candidate windows from orchestration task records (`task_id`, `protocol_id`, `started_session_ms`, `ended_session_ms`). Apply the **same** W4.1 duration and overlap rules.
10. If `session.mission.tasks` is also non-empty, cross-check: same number of started tasks, equal `started_session_ms` / `ended_session_ms` after sorting by start then stable task id. Any disagreement → `inconsistent_evidence`. Do not mix one window list from mission and another from orchestration.
11. Hand the V1 session plus derived window descriptors to the existing W4.1 window assigner. Membership remains:

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

`window_origin` may gain the value `orchestration_sidecar`. Fingerprint algorithm, canonical key order, and CLI publication rules stay at W4.1.

If additive keys are introduced, bump a **reader** version (`dataset-orchestration-read/0.1-provisional`) recorded on the manifest (`orchestration_reader_version`). Do not silently change `dataset-validate/0.1-provisional` or `dataset-window/0.1-provisional` semantics.

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

### 4.2 Interrupted and failed

| Record | Dataset behavior |
|---|---|
| V1 `status: interrupted`, open task `end_ms` null | Keep (W4.1). Membership `< duration_ms`. Do not claim completion. |
| V1 `status: completed`, open task | Reject (W4.1). |
| Orchestration `state: failed`, V1 still `interrupted` or `completed` | Accept only if V1 status is `interrupted` or the merged writer defines V1 `failed`. Copy windows that started. Never rewrite status to `completed`. Set `usable_for_behavior` false. `engineering_valid` may be true. `scientific_eligibility` stays `pending_review`. Record `orchestration_state: failed` when the additive field exists. |
| V1 `status: failed` only after a merged writer emits it | Treat as unusable for ocular/behavior products; keep windows that exist; never claim completion. |

Do not fabricate later protocol tasks after interruption or failure.

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
| 6 | Mission and orchestration agree | Accept; one window list |
| 7 | Mission and orchestration disagree on start/end | Reject `inconsistent_evidence` |
| 8 | Orchestration `session_id` ≠ V1 | Reject `session_mismatch` |
| 9 | Unknown orchestration `contract_id` / version | Reject `unsupported_schema` |
| 10 | Malformed events array | Reject `malformed_output` |
| 11 | Duplicate `task_id` | Reject |
| 12 | Duplicate / conflicting session JSON | Keep identical first; conflict fails build |
| 13 | `replay.ok === false` | Reject |
| 14 | Replay timeline mismatch on optional re-run | Reject |
| 15 | Claimed `measurement_fidelity: true` | Reject |
| 16 | Interrupted open orchestration task | Keep; no completion claim |
| 17 | Completed V1 + open orchestration task | Reject |
| 18 | Orchestration `state: failed` | No completed claim; not usable_for_behavior |
| 19 | Late processed, in-window acquisition | Assigned (W4.1 rule) |
| 20 | Exclusive end | Unassigned `post_task` |
| 21 | Privacy: no notes / UA / tokens / protocol notes | Redacted |
| 22 | Serialized orchestration artifact alone | Reject |
| 23 | `--orchestration off` with sidecar present | Reject (do not strip) |
| 24 | Deterministic repeat with sidecar | Byte-identical |
| 25 | No network / no D1 / no OpenAI | Same as W4.1 |

## 8. W4.2 implementation plan (runtime, later)

| Slice | After merge | Not in slice |
|---|---|---|
| **W4.2.0** (this document) | Architecture, matrix, DEC-019, migration | Runtime code, tests that fake merged contracts |
| **W4.2.1** | `orchestration.mjs` importing develop export helpers; CLI `auto`/`off`; reject unknown versions | Scientific slot mapping |
| **W4.2.2** | Mission/orchestration cross-check; optional replay gate; failed/interrupted rules | Measurement replay |
| **W4.2.3** | Unsigned-slot windows, additive sidecar fields, 25 synthetic tests, fingerprint lock vs W4.1 | W5 models, D3 stats, PR merges |

Acceptance for W4.2.1–.3: W4.1 tests still pass; V1-only fingerprints match W4.1; sidecar cases match §7; no PR #19 files copied by hand.

## 9. Non-goals

- No copy or cherry-pick of unmerged PR #19.
- No merge of PR #19, PR #20, or this branch.
- No W5, no ML, no Python validator, no ocular pooling, no PERCLOS threshold.
- No change to `sanitizeSession`, Go/No-Go trial code, or camera algorithms.
- No treating generic slots as PVT or Go/No-Go.
- No using event-only replay as blink/EAR proof.
- No new cloud allowlist or sidecar upload.
