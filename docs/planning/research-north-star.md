# NeuroLens — Research and Engineering North Star

Status: strategic design, not implemented functionality. Updated 2026-10-14.

## Mission
Build an evidence-grounded, privacy-conscious multimodal research platform to test whether webcam-derived ocular/facial/head measurements add reliable information beyond cognitive-task performance and self-report when studying within-person changes in sustained attention and cognitive fatigue. This is exploratory research, **not diagnosis, screening, or clinical decision support**.

## Falsifiable central question
After accounting for task performance, time-on-task, participant baselines, and measured confounders, do quality-controlled visual signals improve prediction or explanation of independently defined self-report/task outcomes on unseen participants? A null result is a valid research result.

## Three deep technical pillars
1. **Biomedical measurement and experimental science:** pre-registered hypotheses, protocol versions, calibration and device reliability, practice/baseline/task/probe phases, timing validation, fatigue and mind-wandering labels, confounders, repeated-measures inference, participant consent and ethics.
2. **Production-grade data/CS infrastructure:** browser-local camera inference; event-time vs processing-time alignment; frame latency, gaps, dropout and quality flags; modular tracking/features/tasks/session/persistence; schema evolution; provenance; reproducible offline exports; authorization and withdrawal.
3. **ML and evidence-grounded AI:** non-visual baselines, quality-aware feature fusion, participant-grouped evaluation, nested/training-only preprocessing, calibration and uncertainty, missing-modality ablations; optional LLM analysis assistant limited to deterministic tool outputs and cited experiment artifacts.

## Target dataflow
Camera -> local tracking + quality -> timestamped ocular/facial/head observations -> quality-aware windows
Task/protocol + self-report + confounders -> event timeline -> aligned, versioned session record
Session record -> local store -> separately consented upload -> controlled research export
Export -> validation + cohort manifest -> reproducible statistics -> grouped model evaluation -> signed/versioned result artifacts -> evidence-grounded reports/optional agent

## Non-negotiable research principles
- Labels are independently collected, never inferred from the same visual features used as predictors.
- EAR calibration does not establish screen gaze. Low-confidence gaze must be suppressed rather than fabricated.
- Keep missing, no-face, camera-off, simulated and real samples distinct.
- Align on acquisition/event timestamps; test asynchronous late frames and task transitions.
- Compare task-only, self-report/context-only, visual-only, and fused models. Evaluate incremental value rather than headline accuracy.
- Split by participant for generalization; report number of independent participants, confidence intervals, class balance, calibration and failure modes. Distinguish within-person longitudinal tests from unseen-person tests.
- Separate observational association from causal claims. Report negative findings.
- No video uploads by default; no participant records, tokens, raw images or secrets in Git.
- An LLM cannot invent observations, effect sizes, significance or medical claims; it cites immutable analysis artifacts and declines unsupported conclusions.

## Research questions and test matrix
| ID | Hypothesis or engineering claim | Required evidence |
|---|---|---|
| RQ1 | Eye/face feature extraction is usable on ordinary webcams | Annotated event comparisons, sensitivity/precision, coverage, frame gaps and device strata |
| RQ2 | Visual feature trajectories covary with task-time and self-report changes | Repeated-measures estimates, uncertainty, confound adjustment and null findings |
| RQ3 | Visual data adds signal beyond behavioral baselines | Participant-held-out baseline vs fusion comparisons and ablations |
| RQ4 | Findings remain reliable under missingness and device differences | Missingness stress tests, stratified error and robustness plots |
| RQ5 | Agent summaries remain faithful to statistical artifacts | Citation coverage, unsupported-claim rate, adversarial fixtures and abstention tests |

## Workstreams and completion gates
### A. Mission foundation (immediate)
- A1: fix preview frame-start filtering and independent calibration deadline, with regression tests.
- A2: validate camera/task-only/simulated complete and interrupted journeys, including real-browser/device evidence.
- A3: port mission PVT-inspired + Go/No-Go into canonical modules; preserve existing V1 route and single feature engine.
- A4: version multi-task schema and 3 ratings; migrate readers, not participant records; retain cloud opt-in and withdrawal.
Gate: reproducible end-to-end sessions, no timing contamination, backward-compatible exports, documented camera limitations.

### B. Measurement science
- B1: define units, sampling, quality taxonomy, latency and clock synchronization.
- B2: independently validate blink/closure, selected blendshapes/head events; define abstention rules.
- B3: pilot coarse gaze calibration with held-out targets; disable gaze conclusions if validation fails.
Gate: published measurement QA report with failure cases and acceptance thresholds defined before evaluation.

### C. Experimental protocol
- C1: freeze versioned practice/baseline/task/rest protocol and exact event schema.
- C2: add thought probes with strictly pre-probe windows and uncertainty response.
- C3: record confounders (sleep, caffeine, lighting, device), consent and presentation/feedback settings.
- C4: ethics/privacy review before broader participant recruitment.
Gate: pilot protocol, analyzable labels, timing checks and reproducible exclusion rules.

### D. Research data and statistics
- D1: validated export reader, schema registry, immutable cohort manifest and dataset lineage.
- D2: window builder with missingness, coverage, participant IDs and label provenance.
- D3: descriptive/repeated-measures analyses with uncertainty, sensitivity analyses and null results.
Gate: one-command offline reproducibility from synthetic fixtures and an authorized de-identified pilot dataset.

### E. Modeling
- E1: task-only and context baselines before visual predictors.
- E2: interpretable visual and fusion models, participant-grouped validation and training-only preprocessing.
- E3: ablations, calibration, subgroup/device robustness, bootstrap intervals, model cards.
Gate: held-out participant evaluation with complete leakage audit; if data insufficient, publish feasibility rather than accuracy claims.

### F. Evidence-grounded research agent
- F1: deterministic tools to query cohort, run approved analyses and retrieve versioned results.
- F2: claim-to-artifact citations, strict no-diagnosis policies and abstention on weak evidence.
- F3: regression suite measuring numerical fidelity, citation correctness and hallucination rate.
Gate: reproducible agent answers linked to exact analysis runs; no free-form ungrounded interpretation.

### G. Demonstration and extension
- G1: public synthetic-data demo and private researcher view with honest quality/missingness display.
- G2: reproducibility bundle, architecture decision records, threat model, benchmark and limitations.
- G3: optional video task adapter only after shared interfaces stabilize; interview/hiring judgments and ADHD prediction are out of scope.
Gate: interview-ready walkthrough showing design tradeoffs, scientific limitations, tests and real evidence.

## Senior-level engineering review checklist
For every change: research question -> contract -> implementation -> tests -> measurement evidence -> privacy impact -> documentation -> rollback/migration plan. Track planned, implemented, validated separately.

## Source-of-truth pointers
- docs/architecture/overview.md: current implementation boundaries
- docs/architecture/repository-layout.md: file ownership
- docs/planning/roadmap.md: dependency-ordered steps
- docs/planning/mission-integration.md: immediate preview blockers
- docs/planning/implementation-status.md: what actually exists
- AGENTS.md: multi-contributor rules

This document does not authorize automatic merge of preview code, participant recruitment, deployment, or clinical claims.
