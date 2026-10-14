# Collaboration and Ownership Plan

Status: **Proposed allocation pending confirmation by both human collaborators**. Updated 2026-10-14. This is a coordination proposal, not an exclusive permission system.

## Named collaborators
- **Person A: Caijia — University of British Columbia (UBC) student**
- **Person B: Linxi — University of Waterloo student**

## Team shape
- **Person B — Linxi (LLM / AI Research & Engineering Lead):** architecture, tracking and event-time correctness, schema/storage/privacy implementation, training infrastructure, multimodal fusion and evidence-grounded agent runtime.
- **Person A — Caijia (Biomedical Fatigue Research & Engineering Lead):** Own research design **and production code** for cognitive task engines, protocol/probe logic, measurement QA tooling, dataset adapters, statistical analysis, ML baselines/ablations and research-agent evaluation; also own scientific interpretation.
- Both leads own scientific validity, research ethics, reproducibility, release readiness and cross-review.

**Research-to-code loop:** Linxi studies LLM/agent/retrieval/evaluation methods and implements AI tooling; Caijia studies ocular, cognitive fatigue and behavioral measurement science and implements features/tasks/measurement QA. Each delivers a hypothesis, references, executable PR, tests and metrics. Saturday integrates; Sunday evaluates against agreed baselines, then both refine code. Scientific plausibility alone does not establish improved accuracy.

**Engineering parity:** Both people are hands-on developers and submit code PRs every week. Research deliverables never substitute for Person A's implementation. Person A owns research-facing software; Person B owns platform-facing software. Shared contracts are jointly reviewed.

## Responsibility matrix
| Workstream | Primary | Required review |
|---|---|---|
| System and module architecture | Engineering | Research |
| Tracking lifecycle and timestamp synchronization | Engineering | Research for timing semantics |
| Experiment protocol and PVT/Go-No-Go semantics | Research | Engineering for interfaces |
| Measurement validation, quality thresholds | Research | Engineering for instrumentation |
| Session schema, consent, storage and exports | Engineering | Research for data meaning |
| Statistical analysis and repeated measures | Research | Engineering for reproducibility |
| ML infrastructure and leakage-safe splits | Engineering | Research for cohort/metrics |
| Feature hypotheses and ablation experiments | Joint | Joint |
| Multimodal fusion | Engineering | Research for interpretation |
| Evidence-grounded LLM agent | Engineering | Research for claim fidelity |
| Demo, reproducibility package and manuscript | Joint | Joint |

## Seven-week sprint proposal

The week-by-week responsibilities, Friday handoffs and Saturday/Sunday integration criteria are in [Seven-Week Sprint](seven-week-sprint.md). This is a proposed adaptive framework pending both collaborators' confirmation.

## Immediate parallel work (before mission integration)
**Person B — Linxi (Engineering branch):** stabilize late-frame/task boundary, independent calibration deadline, dropout/restart tests and canonical integration contracts. Do not silently change experiment parameters.

**Person A — Caijia (Research systems branch):** implement cognitive task engines and trial metrics with tests, plus falsifiable hypotheses, provisional PVT/Go-No-Go/baseline protocol, label and confounder definitions, measurement QA plan and synthetic fixtures. Do not change production data collection/consent without joint review.

**Integration checkpoint:** agree on event names, timestamps, units, quality/missingness taxonomy, protocol version and schema changes before either branch changes shared contracts.

## Agent collaboration rules
1. Read AGENTS.md, docs/planning/decision-log.md, docs/planning/research-north-star.md, docs/planning/roadmap.md, docs/planning/implementation-status.md, and this file before starting.
2. Inspect main HEAD, open PRs and the specific files affected. Agents and private chats are not automatically synchronized.
3. Use separate branches and reviewable PRs for code, protocols, schemas and architecture. One PR should have bounded ownership and acceptance tests.
4. PR description: problem/hypothesis, changed paths, schema/protocol/privacy effects, tests run, real-world validation pending, reviewer questions.
5. Cross-review changes affecting scientific claims, participant data, schema, shared timing and model evaluation. Do not force-push over collaborators' work.
6. Accepted changes go in decision-log.md; implementation evidence goes in implementation-status.md. Proposed allocation is not an accepted team decision until both collaborators approve.

## Model/research boundary
Research lead owns scientific interpretation, not just documentation or AI prompting. Engineering lead owns reliable modeling systems, not unilateral scientific conclusions. Neither owner may claim medical diagnosis or scientific validation from simulated tests.
