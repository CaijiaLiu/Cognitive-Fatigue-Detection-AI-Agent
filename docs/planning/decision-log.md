# NeuroLens decision log (shared across human and AI contributors)

This file is the durable record of **accepted project decisions**, not a speculative backlog. Last updated 2026-10-14. Read alongside [Research North Star](research-north-star.md), [Roadmap](roadmap.md), [Implementation Status](implementation-status.md), and [AGENTS.md](../../AGENTS.md).

## Accepted decisions — 2026-10-14

### DEC-001: Research-first scope
**Accepted.** Primary focus: cognitive fatigue and sustained attention, framed as an exploratory, falsifiable research question. Mind wandering, video analysis, and other adapters are secondary extensions, not parallel core products. No ADHD diagnosis, hiring/personality inference, or clinical claims.

**Reason:** A scientifically defensible focused result is stronger than several shallow demos.
**Implementation implications:** Prioritize protocol, labels, measurement QA and repeated-measures statistics; maintain explicit out-of-scope boundaries.

### DEC-002: Engineering depth over feature count
**Accepted.** Prioritize trustworthy camera/task event-time synchronization, late-frame isolation, calibration timeouts, missingness/provenance, protocol/schema compatibility, consent/withdrawal, grouped data evaluation and reproducibility. Do not expand features before core measurement and session correctness gates.

**Reason:** Data correctness is the foundation of all downstream research claims.
**Immediate work:** Follow mission-integration.md phases 1A–1E. Port preview into canonical modules, not a second parallel engine.

### DEC-003: Evidence-grounded research agent
**Accepted as a long-term architectural objective, not an implemented feature.** The LLM agent consumes approved deterministic analysis tools and immutable, versioned research artifacts; every substantive result should trace to a reproducible computation. It must report uncertainty, limitations and abstain when evidence is insufficient. No generic chatbot presented as scientific intelligence.

**Prerequisites:** valid protocol, adequate research data, reproducible statistics and leakage-safe modeling baselines.
**Acceptance:** claim-to-artifact traceability, numeric fidelity, hallucination/unsupported-claim tests and documented failure behavior.

### DEC-004: Repository as cross-agent source of truth
**Accepted.** Conversations between individual humans/agents are *not* synchronized automatically. GitHub committed documents, PRs, issues and code are the shared communication channel. All accepted architecture, scope, experiment, data-contract or milestone decisions must be committed before they are treated as team-wide agreements.

**Change protocol:**
1. Before work, read AGENTS.md, this decision log, Research North Star, Roadmap, Implementation Status, relevant architecture/contracts, and inspect latest branch/PR changes.
2. For a proposed change, record rationale, alternatives, affected contracts/files, scientific/privacy implications, tests and migration/rollback plan. Seek human agreement for scope-altering decisions.
3. Use a feature branch and PR for code, schema, protocol or significant architectural changes. Avoid force pushes and overwriting other contributors. Documentation-only agreed decisions may be committed to main with authorization.
4. After implementation, update Implementation Status with exact commit/PR, implemented versus validated evidence, tests actually run and pending limitations; update roadmap and this log if decisions change.
5. If branches conflict, reconcile against current main and open PRs. Do not silently overwrite accepted decisions; add a superseding decision with rationale.
6. Distinguish **accepted design**, **implemented code**, **scientifically validated**, and **deployed**. They are not interchangeable.

**Ownership:** Human collaborators approve changes in scientific scope, consent/data collection, clinical positioning, and releases. Agents may propose and implement bounded work, but may not assume another agent has seen a private conversation.

## Decision template for future entries

### DEC-XXX: Title
- Date / status: Proposed | Accepted | Superseded
- Context and problem:
- Decision and rationale:
- Alternatives considered:
- Impacted architecture / protocol / schema / privacy:
- Implementation owner or PR:
- Validation and release gate:
- Supersedes (if any):

## Coordination note
This file is intended to be short and append-oriented. Detailed designs live in docs/architecture, experiments in docs/research, execution in docs/planning, and privacy/deployment in docs/operations. A decision does not authorize automatic participant recruitment, production deployment or merging an unreviewed branch.
