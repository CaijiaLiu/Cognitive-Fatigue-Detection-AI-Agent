# NeuroLens — Seven-Week Integrated Research & Engineering Sprint

**Status:** Proposed planning framework; dates and gates are targets, not proof of completion.  
**Dates:** 2026-10-19 (Monday) through 2026-12-06 (Sunday).  
**People:** **Person A — Caijia (University of British Columbia / UBC student)**, Biomedical Research & Computational Science Lead; **Person B — Linxi (University of Waterloo student)**, Engineering & AI Lead.  
**Goal (stretch, accepted as planning ambition):** Complete all seven A–G engineering and research workstreams within seven weeks, including real-device measurement validation, a properly authorized human-participant study where feasible, participant-held-out generalization experiments, and clinical-level validation planning/evidence where feasible. The team explicitly aims beyond a prototype. Scientific validation and clinical claims are evidence-gated: neither agent throughput nor the deadline guarantees adequate participants, ethics approval, clinical populations, statistical power, external validity, or clinical validation. Report each as achieved, exploratory, or blocked, never silently mark complete.

See [accepted decisions](decision-log.md), [ownership](collaboration-ownership.md), [research north star](research-north-star.md), [roadmap](roadmap.md), [mission integration](mission-integration.md), and [implementation status](implementation-status.md). This schedule does not silently override their safety/quality gates.

## High-throughput agent-assisted execution rules

- Run parallel **bounded PRs** within each person's ownership (implementation, test fixtures, analysis, docs), with one integrator per shared interface; do not let agents independently rewrite the same core module.
- Each week requires **four outputs per owner**: substantive implementation/research artifact, automated tests, reproducible evidence/results, and integration documentation. Deliver working vertical slices rather than just scaffolding.
- Start participant-study feasibility, **UBC and Waterloo institutional ethics jurisdiction / multi-institution collaboration determination**, recruitment channels, sample-size/power rationale, and device matrix in **Week 1**. Caijia is at **UBC**, not Waterloo: do not assume Waterloo's ethics process alone governs this joint project. Ask the relevant UBC and Waterloo research ethics offices/supervisors which institution is responsible, whether harmonized/multi-site review is required, and whether either student's activity is exempt before recruiting. No recruitment or identifiable collection before required approvals and consent. Clinical validation requires an appropriately designed study and expert oversight; if unavailable, mark as unmet.
- Aim to complete device validation by Week 2–3, pilot study and data QA by Week 3–4, participant-held-out experiments by Week 5, and replication/robustness plus final reporting by Week 7, **conditional on sufficient authorized data**.
- Keep two scoreboards: **Engineering DoD** (merged code/tests/contract) and **Scientific DoD** (independent evidence/sample/uncertainty). A weekly stage may be engineering-complete while scientifically unvalidated.

## Operating cadence and handoff contract

- **Monday:** both read main HEAD and open PRs, agree week's hypothesis, schemas/interfaces, scoped issues, and pass/fail gates. Freeze shared contracts before implementation.
- **Tuesday–Thursday:** separate research and engineering branches; each owner produces reviewable artifacts, not only progress descriptions. Midweek interface check.
- **Friday:** Person A delivers protocol/analysis note, fixture, expected outputs and limitations; Person B delivers PR, commands/tests, schema notes and example output. Both publish to repo.
- **Saturday:** joint integration: run both contributions together, inspect event/schema provenance and failures; log issues. No silent scope changes.
- **Sunday:** cross-review, reproducibility test, accept/partial/block decision, update implementation-status.md and decision-log.md (only if a decision changes), revise next week's plan.
- **Definition of done:** merged reviewed artifacts + documented reproducible checks + integration handoff + outstanding empirical limits. Use separate labels **Designed / Implemented / Verified in tests / Validated on real data / Deployed**.
- **Time-box rule:** if a gate fails, preserve the blocker and reduce next week's scope to a credible vertical slice; never manufacture validation. Feature branches/PRs for substantive changes; no production deploy or participant recruitment without explicit authorization.

## Parallel empirical study track (runs all seven weeks)

| Week | Person A — Caijia | Person B — Linxi | Evidence gate |
|---|---|---|---|
| W1 | UBC/Waterloo research ethics jurisdiction check, consent and study feasibility, sample-size rationale, participant eligibility, device/lighting protocol | Local-only pilot tooling, anonymized IDs, QA telemetry, data export audit | Written authorization/ethics status; no unauthorized enrollment |
| W2 | Annotator rubric and inter-rater pilot, measurement reference plan, device strata | Instrumented capture/quality reports, timing QA | Real-device reference comparisons where permitted |
| W3 | Pilot study administration after approvals, protocol adherence and recruitment tracking | Consent-safe pilot export, quality dashboard and schema QA | Verified pilot provenance and participant counts |
| W4 | Audit labels, missingness, exclusion and repeated-measure assumptions | Reproducible cohort manifest and locked dataset splits | Cohort manifest with independent-participant count |
| W5 | Held-out participant interpretation and robustness hypotheses | Grouped model evaluation, ablations, uncertainty | No generalization claim without adequate held-out participants |
| W6 | Replication or sensitivity analysis, agent scientific-answer benchmark | Agent evidence tracing, reliability regression | Reproducible claims and abstentions |
| W7 | Final scientific limitations, validity evidence, next-study/clinical validation plan | Release evidence bundle, benchmark and audit | Separate engineering/scientific/clinical status report |

## Week 1 — Stage A: Foundation / Mission integration
**2026-10-19–25**
- **Person A (research):** Specify what the provisional PVT-inspired and Go/No-Go tasks measure, precise stimuli/trial/outcome definitions, pre/between/post fatigue scales, practice effects, feedback-on confound and task-only vs camera comparability. Deliver `docs/research/protocols/mission-v1-spec.md` (proposed path), an event dictionary (trial onset, response, omission, rating, task start/end), and 3–5 testable invariants. Reference: current `docs/planning/mission-integration.md`; Basner & Dinges (2011), *Maximizing sensitivity of the psychomotor vigilance test (PVT) to sleep loss*; Robertson et al. (1997), *'Oops!': performance correlates of everyday attentional failures in traumatic brain injured and normal subjects* (SART as related, not equivalent to Go/No-Go).
- **Person B (engineering):** Fix late/pre-start frame contamination, independent calibration timeout, stale callbacks/dropout; integrate mission adapters with canonical tracking/features/session modules without duplicate engines. Define versioned event timestamps (acquisition vs processed, task-relative vs session-relative), keep V1 readers and consent boundaries. Deliver scoped PR(s), synthetic transition fixtures and unit/flow tests; no schema/cloud rollout without coordinated contract.
- **Friday handoff:** Person A event dictionary + trial invariants ↔ Person B timestamped event JSON sample + compatibility matrix.
- **Weekend integration gate:** demo and full journey in simulated/task-only modes, interruption/restart, delayed-frame tests, old V1 records readable; real camera checks separately marked pending unless run.

## Week 2 — Stage B: Measurement / QA
**2026-10-26–Nov 1**
- **Person A (research):** Define blink/closure, no-face, head motion, optional facial action semantics; measurement reference procedure (manually annotated short, consented *local-only* clips where permitted; do not commit raw video); coverage, precision/recall, timing error, device/lighting strata, exclusion thresholds. Decide whether coarse gaze is feasible, with held-out calibration target plan; if not, mark unavailable. Deliver measurement QA protocol, annotation rubric, metrics specification and fixture expectations. References: Soukupová & Čech (2016), *Real-Time Eye Blink Detection using Facial Landmarks*; MediaPipe Face Landmarker documentation; Holmqvist et al. (2011), *Eye Tracking: A Comprehensive Guide to Methods and Measures*.
- **Person B (engineering):** Implement quality flags and coverage/gap/latency metrics, event-time windows, no-face/camera-off vs open distinction, selected feature adapters only if validated semantics; add instrumentation and regression tests. Avoid claiming gaze coordinates from uncalibrated iris proxy.
- **Friday handoff:** QA rubric/threshold proposal ↔ instrumented event trace and quality report.
- **Weekend gate:** QA script reproducibly produces metrics from synthetic fixture; real-device sample results included if ethically/operationally available, otherwise marked unvalidated; quality suppression demonstrable.

## Week 3 — Stage C: Protocol / Experimental systems
**2026-11-02–08**
- **Person A (research):** Finalize versioned pilot protocol: consent, practice, baseline, task order, rest, ratings, thought probes (including unsure), sleep/caffeine/lighting/device confounders, feedback condition, counterbalancing rationale and exclusion rules. Define labels independently of visual predictors; only pre-probe windows for mind-wandering analysis. Deliver protocol v1, participant-facing script, data dictionary, pilot checklist and ethics/recruitment constraints. References: Smallwood & Schooler (2015), *The Science of Mind Wandering*; CONSORT-style transparent reporting principles where relevant (not claiming trial compliance); applicable institutional research ethics guidance.
- **Person B (engineering):** Build explicit protocol state machine and configurable task adapters, timestamped probes/confounder form, versioned schema and backward-compatible readers; preserve separate consent and withdrawal. Test interruptions, hidden tab, timing and invalid transitions.
- **Friday handoff:** state diagram/labels/confounder schema ↔ generated versioned session record and migration/compatibility tests.
- **Weekend gate:** complete synthetic pilot in all modes; schema validated; old data readable; no unauthorized production data collection.

## Week 4 — Stage D: Research data / Statistics
**2026-11-09–15**
- **Person A (research):** Predefine estimands and primary/secondary outcomes, participant-level repeated-measures strategy, missingness/exclusions, confidence intervals, sensitivity analysis and null-result reporting. Create synthetic examples with known expected summaries and an analysis interpretation guide. References: Bland & Altman (1995), *Calculating correlation coefficients with repeated observations: Part 1—Correlation within subjects*; scikit-learn documentation on grouped cross-validation (for later).
- **Person B (engineering):** Build offline Python export validator, schema registry/reader, immutable cohort manifest, window builder with quality/provenance and one-command reproducible statistics pipeline; no new backend service unless necessary. Test old/new schema, missing windows and timestamp alignment.
- **Friday handoff:** statistical analysis plan + expected outputs ↔ CLI, manifest, generated tables/plots with run IDs.
- **Weekend gate:** from committed synthetic fixtures, one command regenerates exact tables/plots and exclusion counts; real participant analysis only if approved, adequate data exist.

## Week 5 — Stage E: ML / Evaluation
**2026-11-16–22**
- **Person A (research + AI):** Specify scientific baselines and feature hypotheses; co-design task-only, visual-only, context-only and fused ablations, leakage risks, primary metrics, uncertainty and robustness by device/participant. Interpret model failure and negative findings; do not infer diagnosis. References: Roberts et al. (2017), *Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure*; scikit-learn GroupKFold and Pipeline docs; relevant cognitive-fatigue literature from Week 1–4.
- **Person B (engineering + AI):** Implement leakage-safe grouped splits, preprocessing inside folds, simple interpretable baseline (e.g. logistic regression where outcome is appropriate), optional tree/fusion comparator, ablation runner, confidence intervals, model card and seed/config/run manifests. Never split windows from the same participant across train/test for unseen-person claims.
- **Friday handoff:** predeclared evaluation matrix ↔ model artifacts, metrics and split audit.
- **Weekend gate:** pipeline works on synthetic fixtures; real-data predictive claims only if independent participants/labels are sufficient. If not, mark ML feasibility implemented but empirical validation blocked.

## Week 6 — Stage F: Evidence-grounded LLM research agent
**2026-11-23–29**
- **Person A (research + AI):** Create scientific question set, gold-standard answer rubric, acceptable uncertainty language, claim-to-source mapping, unsupported-claim and medical-claim refusal tests. Include adversarial null and insufficient-sample cases. References: NIST AI Risk Management Framework; research reporting/interpretation standards used in Weeks 4–5.
- **Person B (engineering + AI):** Implement restricted tool interface to versioned analysis runs (cohort summary, hypothesis comparisons, model metrics, provenance lookup), structured response with citations and abstention; offline deterministic fixtures and agent regression tests. Do not grant unrestricted raw participant-data access or allow fabricated calculations.
- **Friday handoff:** benchmark questions + expected evidence ↔ agent tool schemas and cited response fixtures.
- **Weekend gate:** all numerical claims trace to an immutable analysis artifact; evaluate unsupported claims and missing-evidence abstentions. External LLM dependency optional; deterministic fallback required.

## Week 7 — Stage G: Platform / Reproducible release
**2026-11-30–Dec 6**
- **Person A (research):** Write scientific summary (questions, methods, outcomes, validity threats, negative findings), protocol appendix, limitations, ethics/privacy statement and next-study proposal. Review all demo language for unsupported health claims.
- **Person B (engineering):** Integrate public synthetic-only walkthrough, private researcher workflow, architecture diagram, CI/test matrix, reproducibility commands, security/privacy checklist, deployment documentation and stable release candidate. No auto-deployment; require explicit approval.
- **Friday handoff:** research report + claim audit ↔ release candidate + reproducibility bundle.
- **Weekend gate:** fresh-clone setup, full synthetic end-to-end run, tests, cross-review, version tag only if accepted; list validated vs pending and next research milestones.

## Required weekly handoff template
- Week/stage, Person A artifact link/PR, Person B artifact link/PR, owner/reviewer
- Research question, exact operational definitions, target metric, references and unresolved assumptions
- Engineering contract: inputs/outputs, event time/units, quality/missingness, schema/version, privacy, out-of-scope
- Evidence: tests run, fixture IDs, actual device/pilot observations (if any), known failures
- Saturday integration results; Sunday verdict (accepted/partial/blocked), changes to next sprint
- Links to updated status and any accepted/superseding decision

## Stage completion scorecard

For each stage record: (1) feature/analysis code merged; (2) automated tests passed; (3) real-device or participant evidence obtained; (4) independent validation/generalization demonstrated; (5) clinical validation status (not applicable / not started / approved study / evidence achieved). Do not confuse clinical-level ambition with a clinical-grade or diagnostic product.

## Adaptive replanning policy
Every Sunday adjust task scope based on actual gates. Keep stage sequence A–G as an organizing framework, but if A–D are not trustworthy, E/F/G may only deliver tested scaffolding; no unsupported accuracy, scientific validity or completed-stage claims. Maintain one canonical implementation and avoid parallel permanent feature engines.

## External reference verification
Literature titles above are starting points for Caijia to verify (DOI, applicability, full text and methodological relevance) before adding to a formal bibliography. They are not assertions that these papers validate NeuroLens or its outcomes.
