# NeuroLens decision log (shared across human and AI contributors)

This file is the durable record of **accepted project decisions**, not a speculative backlog. Last updated 2026-10-19. Read alongside [Research North Star](research-north-star.md), [Roadmap](roadmap.md), [Implementation Status](implementation-status.md), and [AGENTS.md](../../AGENTS.md).

## Accepted decisions — 2026-10-19

### DEC-014: W3.2 session evidence is an adapter, not a second Agent runtime
**Accepted.** W3.2 adds `analysis-session-evidence/0.1` and `session-evidence/0.1` on top of the existing W1–W2 Research Agent tools. Supported V1 sessions, with optional W3.1 orchestration/mission sidecars, are adapted into structured evidence items and injected through `createAnalysisTools({ store })`. Evidence items are not allowlisted Agent metrics. Generic slots stay unsigned. Missing and dropout values stay missing. The adapter is local/offline by default.

**Reason:** Week 3 needs a fail-closed biomedical-data-to-AI path without inventing fatigue scores or changing Caijia-owned algorithms. A second Agent runtime would fork citation, prompt-injection, and numeric-fidelity contracts.
**Implementation implications:** Reuse the three existing read-only tools. Do not coerce preview records. Do not interpret generic slots as PVT or validated Go/No-Go. Do not change `sanitizeSession`, upload sidecars, or allowlisted metric identifiers. Do not mark W3.2 scientifically validated. Do not start W3.3 from this decision alone.

### DEC-013: W3.1 uses a provisional engineering protocol, not Caijia science
**Accepted.** W3.1 implements `research-protocol/0.1-provisional`, `research-session/0.1-provisional`, and `research-event/0.1-provisional` on top of the W3.0 mission adapter. Existing V1 Go/No-Go remains `go-no-go-v1` / `schema_version` `1.0.0`. Generic slots are engineering placeholders. Pause/resume is not added. Cloud `sanitizeSession` is unchanged. Provisional sidecars stay local-only.

**Reason:** Week 3 needs a deterministic orchestrator before Caijia’s signed protocol and event dictionary exist. Inventing PVT outcomes, fatigue thresholds, or three-rating semantics would silently redefine Person A’s science.
**Implementation implications:** Keep unsigned ids as `PENDING_SCIENTIFIC_REVIEW`. Do not merge preview schema `mission-preview-1`. W3.2 may consume these sidecars only as local engineering metadata. W4 may read the local artifact but must not treat generic slots as biomedical labels.

### DEC-012: Mission foundation uses a provisional local event contract
**Accepted.** W3.0 lifecycle fixes and the mission adapter live in canonical `public/collection` modules. The event contract is `mission-event/0.1-provisional` and is **PENDING_SCIENTIFIC_REVIEW**. It does not change V1 `schema_version` `1.0.0`, upload consent, cloud allowlists, PVT/Go-No-Go science, or metric identifiers. Preview snapshot code is not merged as a second tracking engine.

**Reason:** Stage A/B timing defects must be fixed before protocol orchestration, but Caijia owns unsigned scientific definitions.
**Implementation implications:** Keep `session.mission` local-only (`upload_eligible: false`). Readers must not coerce `mission-preview-1` into V1. Do not start W3.1 protocol orchestration from this decision alone.

### DEC-011: Sites preview is prepared, not published, until Caijia local testing finishes
**Accepted.** Sequence: Caijia local testing → fix reported issues → Sites Preview → later OpenAI. W2.9A documents the Sites path and adds offline `deploy:preflight`. Agents do not create D1, set remote secrets, publish, or perform Caijia's UI/science tests. There is no in-repo `wrangler deploy`.

**Reason:** vinext/Sites publication is a control-plane action. Guessing Wrangler remote commands would be unsafe.
**Implementation implications:** Keep preview fail-closed and mock-only. Mark Sites UI steps NOT_VERIFIED until a human records them. Do not merge to `main` as a deploy.

### DEC-010: Isolated preview D1 is required before any Cloudflare preview
**Accepted.** A mock preview must use `NEUROLENS_DEMO_DEPLOYMENT=preview`, a non-production D1, and `NEUROLENS_DEMO_D1_ISOLATED=1`. The existing production `DB` holds collection sessions and must not be reused. Cloud resources, remote migrations, secret changes, and Worker publishes require explicit human approval. Offline tests do not verify a remote Worker.

**Reason:** The vinext Worker binds one `DB`. Sharing it would expose `research_sessions` to the same process as the demo limiter.
**Implementation implications:** Do not run `wrangler deploy` or create D1 from an agent. Keep cookie `Path=/api/research-agent`. Scope demo SQL to `demo:` keys.

### DEC-009: Public demo uses a shared-secret cookie and D1 rate limits
**Accepted.** The Research Agent public demo is mock-only and requires a server-side shared-secret session cookie. Sites ChatGPT headers remain the researcher-dashboard gate and are not the demo login. Rate limits use the existing D1 `upload_limits` table. Public configuration fails closed if secrets, a shared store, or a non-mock provider are missing. Real OpenAI stays a later, separately approved deployment.

**Reason:** `sameOrigin` is not authentication. An in-memory limiter is not safe across Worker isolates. OAuth and a new database are unnecessary for a single demo password.
**Implementation implications:** Do not store passwords in URLs or `localStorage`. Do not trust `X-Forwarded-For`. Do not treat local unauthenticated tests as a public-deploy default.

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
