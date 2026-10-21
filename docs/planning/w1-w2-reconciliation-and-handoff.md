# Week 1–2 reconciliation: Linxi delivery, deviations, and Caijia handoff

Updated: 2026-10-21. **Status: Linxi W1–W3 engineering reconciliation; Caijia review and Week 3 merge pending.** This document reconciles the original [seven-week sprint](seven-week-sprint.md) with the actual Linxi engineering work on `develop/neurolens-agent`. It does **not** retroactively mark Caijia's tasks complete, authorize changes to her branches, or change scientific contracts. See [implementation status](implementation-status.md), [Week 2 closeout](week2-completion.md), [mission integration](mission-integration.md), and [decision log](decision-log.md).

## Summary / two independent scoreboards

- **Linxi W1 agent groundwork:** Implemented offline: evidence contracts, V1 export adapter, deterministic read-only tools, prompt/answer validation, synthetic end-to-end integration, adversarial/reliability tests. The W1 code was incorporated through stacked commits into develop; some early PRs were closed without direct merge. Historical W1 draft PRs #1 and #3 remain open against `main`. **This is not equivalent to completing the originally scheduled W1 Stage A mission/camera engineering.**
- **Linxi W2 agent/platform engineering:** **ENGINEERING COMPLETE (OFFLINE)**: runtime, HTTP/UI mock demo, opt-in OpenAI adapter (not executed), reproducible evaluation/scoring, authentication, D1-backed session/rate limiting, Sites preview runbook/preflight. PRs #9–#15 merged to develop; [Week 2 closeout](week2-completion.md) provides exact SHAs. Mock evaluations and 143 reported tests are not real LLM or camera measurements.
- **Caijia W1–W2 research/implementation:** **NOT VERIFIED HERE**. Her independently owned code, study protocols, device QA and scientific acceptance must be assessed from her PRs and evidence, not inferred from Linxi's tests.
- **Shared release/science:** `main` unchanged at the recorded W2 closeout; no Sites preview, remote E2E, live OpenAI evaluation, or accepted scientific review. These are deferred gates, not hidden passes.

## Original plan versus delivered (departure register)

| Original seven-week assignment | What Linxi actually delivered W1–W2 | Departure / status | Consequence |
|---|---|---|---|
| W1 Stage A: mission adapter, tracking lifecycle, late-frame rejection, calibration deadlines, timestamp alignment | Agent contracts, export adapter, evidence tools, integration and reliability suite | **Substitution, not completion** of Stage A | Mission preview stabilization 1A–1D remains to be independently audited/implemented before calling mission integration complete |
| W2 Stage B: camera processing, quality/missingness flags, dropout/latency instrumentation, feature adapters | Agent runtime, API, eval, auth, D1 rate limiting, deployment preparation | **Substitution, not completion** of Stage B | Camera feature quality and timing instrumentation remain separate backlog items |
| W6 Stage F: restricted evidence-grounded agent | Much of agent infrastructure brought forward to W1–W2 | **Pulled forward; partial early delivery** | W6 still requires integration with versioned real analyses and Caijia-reviewed scientific benchmark; synthetic fixture tests do not close it |
| W7 Stage G: security, reproducibility, deployment | Mock demo auth, audit, evaluation reproducibility, offline deployment preflight brought forward | **Pulled forward; offline only** | Remote deployment, browser E2E, release audit remain deferred |
| W3 Stage C: protocol state machine and versioned records | W3.0 mission foundation merged to develop; W3.1–W3.3 orchestration, evidence adapter and offline E2E implemented in Draft PR #19 | **Engineering complete (offline), not merged** | Scientific protocol signoff, live browser wiring and real-device validation remain pending |
| W4 Stage D: dataset/window/provenance/statistics pipeline | Evidence provenance and eval infrastructure partly reusable, but not a scientific data pipeline | **Still pending** | Needs scientific estimands, compatible dataset contract and synthetic end-to-end reproducibility |
| W5 Stage E: grouped splits, fold-safe preprocessing, baseline/fusion | Not delivered by W2 agent eval | **Still pending** | No model training/held-out predictive performance should be claimed |

**Important:** Original seven-week A–G schedule is a planning framework, not a completed-week label. The accelerated Linxi workstream is distinct from the original chronological Stage A/B. Do not rename agent W1/W2 as completed camera/measurement stages.

## Linxi W1–W2 completed engineering inventory

| Workstream | Concrete delivery | Evidence / boundary |
|---|---|---|
| W1 tools & adapter | Versioned evidence and answer contracts, V1 session-export adapter, deterministic analysis tools, synthetic fixture path | `analysis/src/neurolens/`, W1 architecture documents, integration/reliability tests |
| W1 integration & adversarial | Offline export → adapter → tools → prompt → validator; injection/unsupported-claim and metamorphic tests | `npm run test:integration`, `npm run test:reliability`; not camera validation |
| W2.1–2.2 | Mock runtime, server-side `POST /api/research-agent`, synthetic UI | PR #9; no real provider quality |
| W2.3–2.6A | Opt-in OpenAI adapter, dry-run evaluation, reproducibility, A–F taxonomy, scoring integrity | PRs #10–#12; **LIVE NOT RUN** |
| W2.7–2.9A | Cookie authentication, fixture authorization, D1 limits, mock-only preview configuration, scoped cleanup, offline HTTP checks, Sites runbook/preflight | PRs #13–#15; **PREVIEW NOT DEPLOYED / REMOTE E2E NOT RUN** |

## Remaining Linxi-owned work (accelerated coding through W5)

1. **First:** audit mission preview against 1A–1D and existing Caijia branches; fix Linxi-owned late-frame/calibration/timestamp defects and avoid duplicate tracking engines. If the interface depends on an unsigned scientific definition, use a versioned provisional adapter and mark blocked.
2. **W3 engineering:** implemented offline in Draft PR #19; retain review/fix/merge gate and do not claim live-camera validation. Caijia owns scientific protocol and task semantics.
3. **W4 engineering:** offline dataset validator, window builder, cohort/run manifest, provenance, compatible modality checks and reproducible CLI. Do not invent participant measurements or clinical statistics.
4. **W5 engineering:** grouped split manifest, fold-safe preprocessing, baseline runner, ablations and model cards using synthetic or licensed compatible data. No cross-person generalization claims without adequate independent participant groups and labels.
5. **Deferred gates:** Caijia local testing → fix observed defects → isolated preview D1/Sites publication with separate authorization → remote E2E → separately approved paid LLM baseline. Do not use real OpenAI merely because adapter code exists.

## Caijia ownership: retained, clarified, and conditional deltas

**No automatic removal or reassignment of Caijia's original coding responsibilities.** The original [seven-week sprint](seven-week-sprint.md) retains her substantive implementation ownership, not just review.

| Stage | Caijia remains responsible for | Change from plan |
|---|---|---|
| W1 A | PVT/Go-No-Go task implementation and deterministic trial tests; stimulus/outcome definitions, event dictionary, rating protocol | **Unchanged.** Coordinate interface with Linxi's mission adapter. Do not mark done without checking her PRs |
| W2 B | Blink/closure annotation/QA code, device/lighting reference procedure, feature units, precision/recall/coverage, exclusion rules and fixture expectations | **Unchanged.** Additional handoff: explicit acceptance/rejection of provisional agent metric identifiers/units and simulated-versus-camera comparability |
| W3 C | Pilot protocol, task config, probes, self-report and confounder logic/tests, state transition invariants; local functional QA of mock Agent | **Added bounded local UI QA**, as agreed; Linxi handles API/security defects found in his code |
| W4 D | Public dataset suitability/license review, adapter and scientific statistics/plots/tests, within-person interpretation | **Unchanged.** Supply schema/expected-output fixtures to Linxi's generic dataset pipeline |
| W5 E | Baseline/ablation hypotheses, scientific metrics, evaluation and interpretation code, negative-result analysis | **Unchanged.** Linxi owns generic split/training runtime; agree contract before either implements |
| W6 F | Scientific question set, gold rubric, evidence-to-claim scoring and safety/refusal tests | **Still required** despite Linxi's early Agent infrastructure; may reuse existing harness instead of reimplementing it |
| W7 G | Research-facing dashboard/results and scientific report/tests | **Unchanged**; coordinate with Linxi's deployment/release work |

**Work reduced / avoided, not removed:** Caijia does **not** need to rebuild Linxi's generic Agent runtime, HTTP authentication, provider adapter, evaluation runner, or Sites deployment tooling. This was never a reason to reduce her research-facing coding scope. She should review their scientific interfaces and provide fixtures/acceptance criteria rather than duplicate infrastructure.

**New or emphasized Caijia handoffs (subject to her confirmation):**
- Local mock Agent UI test report with reproducible bug steps, screenshots only if privacy-safe, and clear separation of UI bugs from scientific objections.
- Metric contract review: `reaction_time_median_ms`, `accuracy`, `valid_trial_count`, task/protocol compatibility, units, n, missingness, and interpretation; record ACCEPT / REVISE / BLOCK with rationale.
- Versioned task/protocol/event sample fixtures for W3, quality/reference traces for W2 measurement QA, and scientific gold examples for W4/W5/W6.
- Real-device and scientific validation remains **Pending / Blocked** until evidence exists. Do not relabel simulated tests as measurement accuracy.

## Team coordination / acceptance gates

- Target **60% Linxi / 40% Caijia hands-on coding** is a workload planning goal, **not verified by commits, PR counts or lines of code**. Track implementation hours, merged code changes and reviewed test ownership across both workstreams; adjust future tasks jointly rather than unilaterally transferring Caijia's responsibilities.
- Linxi may accelerate *independent* W3–W5 code in feature branches, but must not modify Caijia-owned protocol/measurement definitions or silently merge her branches. Use provisional interfaces and explicit `PENDING SCIENTIFIC REVIEW` labels.
- Caijia local functional testing and scientific review are different gates. A UI pass does not approve scientific semantics.
- Update this reconciliation, `implementation-status.md`, and the decision log only when a real change is accepted. This document is a **proposed handoff**, not proof of Caijia agreement.

## Current blockers

```text
LINXI W1 AGENT FOUNDATION: IMPLEMENTED OFFLINE
LINXI W2 AGENT/PLATFORM: ENGINEERING COMPLETE (OFFLINE)
ORIGINAL W1 STAGE A MISSION FOUNDATION: IMPLEMENTED OFFLINE IN W3.0; LIVE DEVICE PENDING
ORIGINAL W2 STAGE B MEASUREMENT QA: NOT CLOSED BY AGENT WORK
CAIJIA LOCAL FUNCTIONAL QA: PENDING
W3.1–W3.3 OFFLINE ENGINEERING: COMPLETE ON DRAFT PR #19; NOT MERGED\nCAIJIA SCIENTIFIC REVIEW: PENDING / BLOCKED
LIVE LLM: NOT RUN
CLOUDFLARE PREVIEW: NOT DEPLOYED
REMOTE E2E: NOT RUN
```

## Week 3 update — Linxi delivery, Caijia handoff and closeout (2026-10-21)

**Status:** Week 3 **Engineering Complete (Offline)**, not scientific validation or live browser integration. W3.0 mission foundation was previously squash-merged into `develop/neurolens-agent` via PR #18. W3.1–W3.3 are together in **Draft [PR #19](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/19)**, branch `feature/w3-protocol-orchestration`, latest reviewed SHA `84d3ccab395b6d393a0a91bf3938c5707d828dbd`. **Do not merge PR #19 before review.** `main` untouched.

### What Linxi actually coded

| Slice | Linxi implementation | Status and evidence |
|---|---|---|
| W3.0 Mission foundation | Tracking lifecycle, calibration deadline, acquisition-vs-processing timestamps, stale/late-frame rejection, mission adapter, task-window handling | PR #18 merged to develop; offline tests only |
| W3.1 Protocol/session orchestration | Versioned provisional protocol/event/session contracts, deterministic state machine, task boundaries, local sidecars, event-only exact-timeline replay, fail-closed readers | Draft PR #19; `public/collection/session/{protocol,orchestrate,orchestration-export}.js` |
| W3.2 Biomedical evidence → Agent | V1 + sidecar validation, full replay verification, stable unique evidence IDs, duplicate-session rejection, source/missingness/provenance, existing read-only Agent tools and abstention | Draft PR #19; `analysis/src/neurolens/adapter/session-evidence.mjs`; no new medical metric |
| W3.3 Offline E2E/reliability | Production-module offline session → export → evidence → Agent; optional default-off browser observer; interrupt/fail/dropout and adversarial integration tests; observation admission consistency hardening | Draft PR #19; `analysis/src/neurolens/integration/research-session.mjs`, `tests/week3-integration.test.mjs` |

At SHA `84d3cca`, Cursor reported **239 passing npm tests**, flow PASS, integration 6 PASS, reliability 7 PASS, TypeScript check 0 errors, and build completed. These are **reported offline checks**, not real camera, Safari, remote deployment or scientific performance results. Tracking observation admission now classifies/inspects read-only, commits the orchestration observation, then advances the tracking cursor; companion automatic dropout is attempted only after accepted observations. Remaining hardening: check/handle companion dropout commit failure; no cross-module rollback is claimed.

**Important limitations:** `public/collection/session/controller.js` does **not** own/use the new orchestrator; optional browser observer is off by default. HTTP demo does not yet accept `analysis-session-evidence/0.1`. W3.1 replay is `event_only` with `measurement_fidelity: false`; it cannot reconstruct ocular measurements. Generic `slot-a` / `slot-b` are not PVT or validated Go/No-Go. No new signed EAR/blink/fatigue metrics, diagnosis, real OpenAI calls, D1/Sites deployment, or cloud sidecar upload. V1 `schema_version: 1.0.0`, Go/No-Go science and `sanitizeSession` remain unchanged.

### What Caijia needs to do — scientific review, not Linxi's infrastructure work

Caijia's W1/W2 original implementation and measurement-QA progress are **not independently verified here**. Week 3 review does not replace her original substantive coding responsibilities or imply completion of PVT, rating/probe or ocular-validation tasks. Her concrete Week 3 handoff is to review [Week 3 closeout checklist](week3-closeout.md) and relevant contracts/code, then record **ACCEPT / REVISE / BLOCK / DEFER** with rationale for:

1. **Protocol and task identity:** `go-no-go-v1` compatibility; generic placeholders remain unsigned; no invented PVT or new pause/resume semantics.
2. **Behavioral science:** Go/No-Go trial/outcome and summary meaning; PVT implementation and tests remain Caijia-owned; rating/pre-post/probe/confounder definitions are not silently added.
3. **Ocular science/QA:** EAR, blink, closure, dropout, coverage, exclusion thresholds and reference traces; distinguish copied observations from signed metrics and camera from simulated/task-only.
4. **Evidence/claims:** allowlisted `reaction_time_median_ms`, `accuracy`, `valid_trial_count`, units, missingness, sample counts, citations, interpretation, abstention; no fatigue or medical diagnosis claims.
5. **Review evidence:** provide small scientific fixtures, expected outputs or concrete correction requests where needed; leave not-yet-implemented science marked DEFER rather than approving it implicitly.

**Division of work:** Linxi fixes orchestration, evidence adapter, tests, privacy or Agent defects identified in review. Caijia owns protocol/metric semantics, scientific QA criteria, task implementations and scientific interpretation. No unapproved edits to Caijia-owned branches. Target 60:40 coding split is a plan, not a verified measurement.

### How Week 3 closes — explicit gates

1. **Engineering:** Linxi completes final code review of PR #19, documents remaining issues (including dropout companion commit handling), and verifies CI against the final SHA. The current label is **Engineering Complete (Offline)**, not live-ready.
2. **Scientific review:** Caijia records ACCEPT / REVISE / BLOCK / DEFER decisions on [week3-closeout.md](week3-closeout.md) or PR #19; blocking issues get assigned and fixed on the same PR, with regression tests and re-review. Deferred unsigned science remains visibly pending.
3. **Merge:** only after both reviewers accept the **offline scope**, mark PR #19 ready and squash-merge into `develop/neurolens-agent`; do not merge into `main`. Keep unverified scientific features excluded. This is a **team-approved offline engineering merge**, not a clinical/scientific validation release.
4. **Independent later gates:** real camera/device + Safari QA, live controller ownership/integration, HTTP demo contract acceptance, optional remote preview/deployment and live LLM evaluation require separate work and evidence. None are automatically passed by merging PR #19.
5. **Week 4 parallel work:** Linxi may design independent dataset contracts/validators on a separate branch from develop without merging PR #19 early or reinterpreting unsigned science. Integrate W3 artifacts only after the agreed contract/merge gate.

**Canonical detail:** [Week 3 closeout](week3-closeout.md), [Week 3 architecture](../architecture/week3-integration.md), [implementation status](implementation-status.md), and [seven-week sprint](seven-week-sprint.md).
