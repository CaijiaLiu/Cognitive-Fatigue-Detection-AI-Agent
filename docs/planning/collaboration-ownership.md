# Collaboration and Ownership Plan

Status: **Proposed allocation pending confirmation by both human collaborators**. Updated 2026-10-14. This is a coordination proposal, not an exclusive permission system.

## Named collaborators
- **Person A: Caijia**
- **Person B: Linxi**

## Team shape
- **Person B — Linxi (Engineering & AI Lead):** architecture, tracking and event-time correctness, schema/storage/privacy implementation, ML training infrastructure, multimodal fusion and evidence-grounded research agent.
- **Person A — Caijia (Biomedical Research & Computational Science Lead):** Own hypotheses, literature, protocols, task semantics, measurement QA, labels/confounders, statistics, scientific interpretation and contribute directly to feature selection, ablations and model evaluation.
- Both leads own scientific validity, research ethics, reproducibility, release readiness and cross-review.

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

## Immediate parallel work (before mission integration)
**Person B — Linxi (Engineering branch):** stabilize late-frame/task boundary, independent calibration deadline, dropout/restart tests and canonical integration contracts. Do not silently change experiment parameters.

**Person A — Caijia (Research branch):** write falsifiable hypotheses, provisional PVT/Go-No-Go/baseline protocol, label and confounder definitions, measurement QA plan, synthetic fixtures. Do not change production data collection/consent without joint review.

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
