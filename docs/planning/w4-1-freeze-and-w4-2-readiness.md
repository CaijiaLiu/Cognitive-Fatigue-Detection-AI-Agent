# W4.1 freeze and W4.2 readiness handoff

Date: 2026-10-21. **W4.1 engineering complete (offline), frozen for review; W4.2 runtime not started.**

## Immutable reviewed baseline

- W4.1 source branch: `feature/w4-dataset-pipeline`, Draft [PR #20](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/20), reviewed implementation SHA `0be80394fa6e7a535137eb85a6adba76a378fc53`.
- W4.1 source branch is **not merged**; do not push additional W4.2 work there.
- W4.2 planning branch: `feature/w4-2-dataset-readiness`, created directly from the reviewed W4.1 SHA. This branch **contains unmerged W4.1 commits** and is stacked on PR #20; it is **not** a branch from develop and must not be merged independently.
- Week 3 Draft [PR #19](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/19) remains unmerged. No cherry-pick of PR #19 is authorized. `main` untouched.

## Linxi's W4.1 deliverables

- Deterministic Node dataset validation and CLI: `analysis/src/neurolens/dataset/`.
- V1 `schema_version: 1.0.0` and optional W3.0 `mission-event/0.1-provisional` only; unmerged orchestration sidecars fail closed.
- Acquisition-time `[start,end)` window assignment; processing time retained as provenance; `session_fallback` explicitly not a measured task boundary.
- No fabricated EAR/blink/medical/fatigue metrics; source-stratified ocular observations; camera presence separated from valid ocular observations; missingness preserved.
- Deterministic canonical manifest and fingerprints; staging-directory publication with default no-overwrite and optional `--replace` rollback on handled failures.
- `engineering_valid` distinct from `scientific_eligibility: pending_review`; browser `participant_ref` is not verified human identity.
- Cursor-reported checks: 191 npm tests (25 dataset tests), flow PASS, integration 6, reliability 7, typecheck PASS, build PASS. Not independently re-executed in this handoff. Synthetic only.

## Frozen contracts and open limitations

Keep dataset-manifest/session/window/observation/validate `0.1-provisional` contracts unchanged during W4.2 planning. Do not alter `sanitizeSession`, Go/No-Go trial semantics, ocular algorithms or Caijia-owned scientific definitions. No real-device, clinical or statistical validation is implied.

Known limitations: `--replace` is recoverable for handled failures, not crash-atomic across the two renames; browser participant alias is not a verified person; session fallback is not a measured task boundary; generic slots remain unsigned. The W4.1 PR may still receive review-driven bug fixes; if so, rebase/update the stacked W4.2 branch explicitly after review, never silently overwrite.

## W4.2 architecture-only objectives

Designed in [dataset-orchestration-adapter.md](../architecture/dataset-orchestration-adapter.md), [DEC-019](decision-log.md), and [DEC-020](decision-log.md). Runtime remains **not implemented**. Terminal V1/orchestration states are fail-closed (no `completed`+`failed` rewrite). Mission/orchestration tasks pair by identity before timestamps.

1. Audit PR #19's **proposed** research-session, event, replay and artifact contracts without importing or copying its runtime code. **Done (read in place).**
2. Write a compatibility matrix: V1 only; V1 + W3.0 mission; future signed orchestration sidecar; unknown/malformed sidecars (fail closed). **Done.**
3. Specify an optional versioned reader boundary with strict session/protocol identity, replay/timeline integrity, provenance, event-only measurement fidelity, task-boundary semantics and missingness. **Done.**
4. Document migration and integration strategy **after** PR #19 merges into develop. Until then, no W4.2 runtime reader or tests that pretend the proposed contracts are already merged. **Done.**
5. Preserve scientific ownership: generic slots cannot become PVT/Go-No-Go without Caijia signoff; no new scientific eligibility or ocular pooling. **Done.**
6. Plan tests for conflicting sidecars, duplicate events/identities, time boundaries, interrupted/failed states, provenance, privacy, deterministic fingerprints, and backward compatibility. **Done (planned matrix; tests not added).**
7. Stop for architecture review. Do not merge PR #19/#20 or this branch; do not start W5.

## Integration sequencing

Review PR #19 and PR #20 separately. Once both are accepted and merged in the approved order into `develop/neurolens-agent`, reconcile the W4.2 planning branch against the merged develop head before implementing the optional reader. A stacked branch based on W4.1 must never be merged directly while its parent PR #20 is unmerged.
