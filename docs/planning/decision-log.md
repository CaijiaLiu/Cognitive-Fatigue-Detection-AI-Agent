# NeuroLens decision log (shared across human and AI contributors)

This file is the durable record of **accepted project decisions**, not a speculative backlog. Last updated 2026-10-19. Read alongside [Research North Star](research-north-star.md), [Roadmap](roadmap.md), [Implementation Status](implementation-status.md), and [AGENTS.md](../../AGENTS.md).

## Accepted decisions — 2026-10-19

### DEC-008: Baseline model metrics exclude runtime and validator substitutes
**Accepted.** For the real-LLM baseline, grounded/numeric/citation rates use provider-invoked answered rows compared to authorized fixture evidence. Validator-forced abstention is not correct model abstention. Unknown cost is NOT_MEASURED, not $0. Prompts and the validator are not tuned on the same baseline run.

**Reason:** Counting empty abstentions or D-class validator rejects as model success inflates a live baseline.
**Implementation implications:** Keep W2.4 report leak/expectation fields for mock 22/22 comparability. Live gold unexpected abstention is FAIL, not an automatic pass.

### DEC-007: Live eval is dry-run unless `--execute`
**Accepted.** `eval:llm --live` prints a dry-run (provider/model, case IDs, caps, illustrative cost) and does not call the provider. Paid evaluation also requires `--execute`, `NEUROLENS_AGENT_ALLOW_LIVE=1`, `OPENAI_API_KEY`, request/token/timeout caps, concurrency 1, and a local `--out` path. An API key is not permission to spend.

**Reason:** W2.4 still allowed `--live` to call OpenAI once `ALLOW_LIVE` was set. W2.5 needs a reproducible readiness gate that can be inspected offline.
**Implementation implications:** Do not invent live results. Configuration fingerprints are reproducible; model outputs are not.

### DEC-005: Real LLM provider remains explicit opt-in
**Accepted.** `NEUROLENS_AGENT_PROVIDER=openai` plus `OPENAI_API_KEY` is not enough to spend money. HTTP demo construction and `eval:llm --live` both require `NEUROLENS_AGENT_ALLOW_LIVE=1`. Default remains mock. `sameOrigin` is not authentication and does not authorize a public paid endpoint.

**Reason:** A local or preview process with only a provider key would otherwise bill on every same-origin POST.
**Implementation implications:** Fail closed before `createOpenAIProvider`. Do not add a full auth system in W2.4. Do not treat estimated `MAX_COST_USD` as a guaranteed spend ceiling; a request cap is not a monetary budget.

### DEC-006: LLM eval layers stay separated
**Accepted.** Evaluation reports must distinguish model behavior, validator rejection, runtime fail-closed skips, and provider errors. Case status is `PASS|FAIL|SKIPPED|PROVIDER_ERROR|NOT_RUN`. n/a numeric/citation rows and unrun/skipped rows are omitted from denominators, not counted as successes. Live mode must not expect planted mock failures such as `999`.

**Reason:** Mock 22/22 e2e does not measure live LLM quality. Mixing layers inflates abstention and numeric scores.
**Implementation implications:** Keep existing scientific metric identifiers unchanged. Caijia review remains blocked.

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
