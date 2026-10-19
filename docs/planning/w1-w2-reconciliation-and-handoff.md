# Week 1–2 reconciliation: Linxi delivery, deviations, and Caijia handoff

Date: 2026-10-19. **Status: proposed coordination update for team review.** This document reconciles the original [seven-week sprint](seven-week-sprint.md) with the actual Linxi engineering work on `develop/neurolens-agent`. It does **not** retroactively mark Caijia's tasks complete, authorize changes to her branches, or change scientific contracts. See [implementation status](implementation-status.md), [Week 2 closeout](week2-completion.md), [mission integration](mission-integration.md), and [decision log](decision-log.md).

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
| W3 Stage C: protocol state machine and versioned records | Not completed by agent work | **Still pending** | Linxi can build adapters around provisional, versioned contracts, not unilaterally finalize scientific protocol |
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
2. **W3 engineering:** versioned session/protocol orchestration, task adapters, missingness/provenance, privacy-safe exports and backward-compatible readers; deterministic synthetic transitions and failure tests. Caijia owns the scientific protocol and task semantics.
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
ORIGINAL W1 STAGE A MISSION INTEGRATION: NOT CLOSED BY AGENT WORK
ORIGINAL W2 STAGE B MEASUREMENT QA: NOT CLOSED BY AGENT WORK
CAIJIA LOCAL FUNCTIONAL QA: PENDING
CAIJIA SCIENTIFIC REVIEW: PENDING / BLOCKED
LIVE LLM: NOT RUN
CLOUDFLARE PREVIEW: NOT DEPLOYED
REMOTE E2E: NOT RUN
```
