# Week 3 engineering closeout

**Status:** Engineering complete (offline) on `feature/w3-protocol-orchestration`. Real-device validation, Caijia scientific review, and deployment are **not** complete. `main` is unchanged. Do not merge.

Draft PR: https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/19  
Base: `develop/neurolens-agent`

```text
WEEK 3: ENGINEERING COMPLETE (OFFLINE)
REAL-DEVICE VALIDATION: PENDING
SCIENTIFIC REVIEW: PENDING
DEPLOYMENT: PENDING
```

## What engineering closed

| Slice | Production modules | Honest status |
|---|---|---|
| W3.0 Mission foundation | `tracking/lifecycle.js`, `session/mission-adapter.js` | Offline implemented |
| W3.1 Protocol orchestration | `session/protocol.js`, `orchestrate.js`, `orchestration-export.js` | Offline implemented |
| W3.2 Evidence → Agent | `adapter/session-evidence.mjs` + existing tools | Offline implemented |
| W3.3 E2E + reliability | `integration/research-session.mjs` | Offline implemented |
| W3.3 admission atomicity | classify → orchestrator commit → tracking commit | Hardened: rejected observations do not advance tracking or insert companion dropouts |

The supported path is deterministic and local:

Session creation → protocol init → mission prep → session start → task start → observations/dropouts → task end → terminal state → local export → W3.2 evidence → existing Agent tools → evidence-grounded `composeAnswer`.

It uses the real orchestrator, export, evidence adapter, and Agent modules. It does **not** replace `session/controller.js`.

## What is not closed

| Gate | Status | Why |
|---|---|---|
| Live browser orchestrator | Not wired | Controller already owns accumulator, Go/No-Go, and mission adapter |
| Real-device / Safari camera | Pending | Synthetic clocks and fixtures only |
| Caijia scientific protocol | Pending | Generic slots, PVT, ratings, probes, ocular thresholds unsigned |
| HTTP demo / Sites / OpenAI | Pending / not started | No new network or deploy path |
| Cloud allowlist | Unchanged | `sanitizeSession` still strips sidecars |

## Caijia scientific review checklist

Use this list for the combined Week 3 review. Engineering passing tests does not tick these boxes.

### Protocol identities and task semantics

- [ ] Confirm `go-no-go-v1` remains the only signed behavioral protocol.
- [ ] Confirm `research-session-sequence/0.1-provisional` `slot-a` / `slot-b` stay unsigned placeholders.
- [ ] Confirm no pause/resume semantics were added or required.
- [ ] Confirm protocol ids / versions on exported sidecars are acceptable as engineering metadata.

### PVT / Go-No-Go scientific ownership

- [ ] Confirm V1 Go/No-Go trial fields and `summarizeTrials` are unchanged.
- [ ] Confirm W3.3 must not introduce a PVT task, PVT outcomes, or a generic-slot-as-PVT mapping.
- [ ] Confirm copied Agent metrics remain only `reaction_time_median_ms`, `accuracy`, `valid_trial_count`.

### Ratings and probes

- [ ] Confirm pre/post V1 ratings were not reinterpreted as a three-rating protocol.
- [ ] Confirm thought probes, unsure labels, and pre-probe windows are still Caijia-owned and unimplemented.

### Ocular measurement interpretation

- [ ] Confirm EAR / blink / closure values are not new signed ocular metrics.
- [ ] Confirm W3.1/W3.2 event-only replay (`measurement_fidelity: false`) is acceptable until stored features exist.
- [ ] Confirm camera vs simulated vs task-only labels are sufficient for later QA.

### Missingness and quality thresholds

- [ ] Confirm dropout (`tracking_gap`) must not be treated as open eyes.
- [ ] Confirm unavailable/missing ocular values stay missing and are not zero-filled.
- [ ] Confirm any future coverage / exclusion thresholds remain unsigned.

### Evidence provenance

- [ ] Confirm session/task identity, contract versions, and `local_only` must survive adaptation.
- [ ] Confirm Agent citations may use only allowlisted V1 behavioral metrics.
- [ ] Confirm conflicting duplicate `session_ref`s and failed timeline replay must stay fail-closed.

### Claims and limitations

- [ ] Confirm fatigue scores, ADHD probabilities, and medical conclusions remain unsupported.
- [ ] Confirm interrupted/failed sessions must not be described as completed.
- [ ] Confirm Week 3 engineering-complete (offline) is not scientific validation or deployment.

## Recommended review order

1. Read [week3-integration.md](../architecture/week3-integration.md) for the actual connected path and browser gap.
2. Read [session-orchestration.md](../architecture/session-orchestration.md) and [session-evidence-adapter.md](../architecture/session-evidence-adapter.md).
3. Inspect `tests/week3-integration.test.mjs` — these exercise production modules, not a second test-only engine.
4. Do not treat green CI as real-device or scientific sign-off.
5. Keep this PR draft until Caijia records the checklist.

## Next after review

- Caijia records protocol / metric / missingness decisions.
- Real-device validation on target browsers, separately marked.
- Later, and only if it cannot change Go/No-Go science, consider enabling the optional browser observer.
- Do not start Week 4 dataset ingest from this closeout alone.

## Final engineering hardening (observation admission)

The W3.3 runtime previously called `tracking.noteAdmitted()` before `orchestrator.recordObservation()`. Tracking could therefore advance, and an automatic dropout could be committed, even when the orchestrator rejected the observation (for example `no_active_task` while the previous task window still contained the acquisition timestamp).

The production path is now:

classify (read-only) → inspect admission (read-only) → commit observation → commit tracking cursor → companion dropout only if the observation was accepted.

Automatic dropout without an accepted observation is not a documented contract and is not emitted. This hardening does not change Caijia-owned task science, V1 Go/No-Go, or camera algorithms. Scientific review remains the next gate.
