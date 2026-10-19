# Linxi W1 — Evidence-grounded Agent: executable contract and handoff

Status: **Proposed W1 engineering contract, not implemented**. Owner: Linxi. Review partner: Caijia. Branch: `feature/linxi-w1-agent-contract-20261018`.

## Why this is first
The current main collector has real browser-derived task/ocular measurements but **no research agent or validated fatigue predictor**. Mission preview is a separate branch; do not port it in this PR. We can implement the LLM-facing boundary using deterministic fixtures before real analysis exists, without claiming scientific validity.

## W1 scope: one vertical slice, no model API or deployment required
1. Define a **read-only analysis tool interface** and its deterministic mock implementation. No access to camera streams, raw face frames, participant identity, cloud tokens or production D1.
2. Define an **evidence artifact envelope** and a typed result schema. Every number in the answer must be grounded in a returned tool value, not recalculated by an LLM.
3. Build an **offline evaluation fixture** with success, missing-data, mismatched-protocol, unsupported-claim and unknown-artifact cases. Make it runnable with the existing project test tooling.
4. Keep the agent as a separate domain module or offline library; do not change current collection, consent, schemas or deployment. This PR is the contract + fixtures + deterministic reference implementation; real LLM provider integration comes later.

## Contracts (v0.1 draft)
Tool request (discriminated union):
- `get_session_summary({ session_ref, analysis_version })`
- `compare_sessions({ session_refs, metric_id, analysis_version })`
- `get_evidence({ artifact_ref })`

Tool response envelope:
```json
{
  "contract_version": "agent-tools/0.1",
  "tool": "get_session_summary",
  "status": "ok",
  "analysis_version": "analysis-fixture/0.1",
  "artifact_ref": "fixture:session-summary:a",
  "protocol_version": "fixture-protocol/0.1",
  "data_origin": "synthetic_fixture",
  "participant_scope": "single_pseudonymous_participant",
  "quality": { "usable": true, "reason_codes": [] },
  "metrics": [
    { "metric_id": "reaction_time_median_ms", "value": 320, "unit": "ms", "n": 12 }
  ],
  "limitations": ["Synthetic example only; no fatigue inference"]
}
```
`status` is `ok | unavailable | incompatible | insufficient_data`. Non-ok responses must contain a machine-readable `reason_code`, with no fabricated metrics. `artifact_ref` is an opaque stable identifier, not a URL or arbitrary file path. Requests are allowlisted and validated; no arbitrary SQL, shell, filesystem, URLs or unrestricted data retrieval.

Agent answer schema:
```json
{
  "answer_version": "agent-answer/0.1",
  "status": "answered",
  "claims": [
    {
      "text": "The fixture median reaction time is 320 ms.",
      "metric_id": "reaction_time_median_ms",
      "value": 320,
      "unit": "ms",
      "artifact_refs": ["fixture:session-summary:a"]
    }
  ],
  "limitations": ["Synthetic fixture; not a fatigue diagnosis"]
}
```
`status` is `answered | abstained`. When `abstained`, `claims` must be empty and `reason_code` must explain why. Every numeric claim must match the cited artifact value and unit. Reject cross-protocol comparison unless explicitly supported by a compatibility rule. A citation must refer to a returned artifact.

## W1 test matrix
- Known session: stable deterministic result; claim matches exact metric, unit and artifact.
- Unknown session: `unavailable` and agent abstains.
- Low-quality / missing feature: `insufficient_data`; do not impute a fatigue label.
- Different protocol versions: `incompatible`; do not compare.
- Unsupported clinical conclusion (e.g. diagnosis): abstain.
- Tool arguments containing unapproved paths/queries: rejected before execution.
- Repeated runs produce identical outputs and no network calls.

## Ownership and integration
- **Linxi:** contract, read-only tool dispatcher, deterministic mock, validation and tests; open a bounded code PR.
- **Caijia:** review metric definitions, unit conventions, protocol compatibility, scientific claim boundaries; deliver measurement QA/feature contract in a separate PR.
- **Shared interface:** `metric_id`, `unit`, `protocol_version`, `analysis_version`, `quality.reason_codes`, `artifact_ref`.
- Friday handoff: code PR, passing test commands, example tool/answer JSON, limitations.
- Saturday: integrate only after both agree on contract; Sunday: run unsupported-claim and numeric-fidelity regression tests.

## Acceptance gate
- Tests execute in repository CI-compatible tooling (prefer existing Node test runner if available).
- Type/shape validation rejects malformed tool requests and responses.
- No model calls or deployment required for W1.
- No direct fatigue score, medical diagnosis, uncalibrated accuracy claim or unsupported numeric inference.
- Update `docs/planning/implementation-status.md` **only after** implementation and tests actually run, with commit and evidence.

## Cursor task — paste verbatim
Read AGENTS.md, docs/planning/decision-log.md, docs/planning/implementation-status.md, docs/architecture/overview.md, docs/planning/mission-integration.md and this document. Inspect current main and active PRs first. Work on a new implementation branch from latest main; do not change mission preview, collection protocol, consent, cloud or deployment. Implement the smallest deterministic read-only agent tool layer and JSON fixture tests for the W1 contract above, using existing repo conventions and Node test runner. Prefer a pure module with explicit dependency injection and no network calls. Add tests for every case in the matrix. Run npm test and any relevant typecheck/build commands; report actual results. Open a PR for Caijia review. Do not claim LLM functionality or scientific validation is complete. If a contract choice is ambiguous, record it in the PR rather than guessing.
