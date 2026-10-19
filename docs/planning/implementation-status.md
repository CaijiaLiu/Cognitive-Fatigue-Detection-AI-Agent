# Implementation status

## W1 evidence-grounded agent tools (2026-10-19)

**Status:** Implemented and verified in synthetic tests. Not an LLM runtime, not scientifically validated, not deployed.

Linxi W1 vertical slice follows the proposed contract in PR #1 and [DEC-003](decision-log.md). Source: `analysis/src/neurolens/agent/`. Tests: `tests/agent-tools.test.mjs`. Contract note: [agent-tools.md](../architecture/agent-tools.md).

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Read-only analysis tool interface | Implemented | `createAnalysisTools().invoke` allowlists `get_session_summary`, `compare_sessions`, `get_evidence` |
| Evidence artifact + provenance | Implemented | `evidence-artifact/0.1` with immutable `deterministic_fixture_lookup` provenance |
| Structured output validation | Implemented | Request, response, artifact and answer validators; numeric claim-to-artifact match |
| Deterministic mock tools | Implemented | Synthetic catalog only; no network, camera, D1 or filesystem retrieval |
| W1 test matrix | Verified in tests | Known session, unknown session, missing evidence, incompatible protocols, unsupported claims, rejected requests, repeatability |
| LLM provider / retrieval over real analyses | Planned | W6 agent runtime; W1 composer is deterministic only |
| Scientific validity of fixture numbers | Not applicable | Fixtures are synthetic and cannot establish empirical performance |

**Not changed:** collection modules, consent, cloud allowlists, mission preview, deployment.

**Checks actually run (2026-10-19):** `npm test` — 22 passed, 0 failed (13 new agent-tools tests plus existing 4 collection and 5 research tests). `npm run test:flow`, `npx tsc --noEmit`, `npm run build` and `tests/integration.mjs` were not rerun because collection, consent and cloud paths were not changed.

**Next task:** Caijia review of `metric_id` / units / protocol compatibility; keep mission-integration work on a separate branch. Do not treat this slice as Stage F completion.

## Current cross-branch status (2026-10-13 Toronto)

Canonical main runtime: `3c3f0aa`. Reviewed preview runtime: `663ed79`, branch `preview/mission-live-camera-v0.3`. Documentation updates do not merge or deploy preview code.

| Capability | Main | Mission preview |
|---|---|---|
| Modular collection / optional cloud workflow | Implemented; real-device validation pending | Original main code retained; preview itself has no uploads |
| English multi-screen mission journey | Not integrated | Implemented; browser flow not verified |
| PVT-inspired + Go/No-Go sequence | Go/No-Go only | Implemented: 3 + 4 minutes |
| Three timestamped fatigue ratings | Pre/post only | Pre/between/post implemented |
| Live eye-state card throughout tasks | Basic collector feedback | Implemented per task, including stale/no-face/unavailable states |
| Local history / JSON and CSV | Implemented, schema 1.0.0 | Implemented separately, schema mission-preview-1 |
| Facial dynamics / screen gaze / thought probes | Planned | Still absent |
| Statistical research / ML | Planned | Still absent |

Preview review reran `npm run check` and `npm test`; all 16 synthetic unit tests passed. No new real-browser or camera validation was performed. The review identified missing task-start frame filtering and a calibration timeout dependent on receiving frames; these are integration blockers, not completed fixes.

Next work: [stabilize and port the preview](mission-integration.md). The earlier V1 audit below describes main, not preview availability.

Snapshot: main at 2f72e925e1c90d113cb6a549c14a46b393a5eb3f, audited 2026-10-10 Toronto time. This snapshot is the original capability audit. The module refactor below changes code organization; it does not implement V2 research features.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Browser camera + local MediaPipe Worker | Implemented; device validation pending | camera.js, tracker.worker.js; real-person/Safari validation outstanding |
| Blink/closure features | Implemented; measurement validation pending | core.js FeatureAccumulator; approximate 10 Hz capture can miss short events |
| Iris position variation | Partial | core.js gaze_x/y and SD; uncalibrated eye-width proxy |
| Screen gaze, dwell, off-screen events | Planned | No screen calibration or dwell segmentation |
| Facial dynamics | Planned | Worker does not request outputFaceBlendshapes |
| Head movement | Partial | Rotation matrix and mean angular movement; no event segmentation |
| Go/No-Go performance | Implemented | app.js + summarizeTrials; one task |
| Fatigue self-ratings | Implemented | Pre/post 1–10; no dedicated resting baseline |
| Thought probes / mind-wandering labels | Planned | No probe engine |
| Confounder questionnaire | Planned | No structured sleep/caffeine/lighting capture |
| Statistical research | Planned | Descriptive summaries only; no inferential analysis |
| ML / independent evaluation | Planned | No model or Python analysis pipeline |
| Local dashboard and exports | Implemented, basic | EAR/RT plots, summaries, IndexedDB history |
| Cloud research workflow | Implemented; production verification incomplete | API, private dashboard, D1, consent, deduplication, withdrawal |
| Video/interview/attention research extensions | Planned | No task adapters yet |

## Verification evidence

During the repository audit, five existing tests in tests/research.test.mjs passed. They test sanitization, consent/rating validation, source consistency, IDs and limits; they do not validate ocular measurements.

README records prior typecheck/build/local API and simulated-browser checks. Those were not rerun in this documentation change. Real-person tracking, production researcher sign-in and research validity are not established by those checks.

## Updating status

Use Planned / Partial / Implemented / Validated, explicitly naming what was validated. Add source path and test/pilot evidence. Do not mark a roadmap step complete merely because its document exists.

## Modular-base handoff (2026-10-10 Toronto)

Refactored collection into tracking, features, tasks, session, reporting, persistence and shared modules; server helpers/validation now live in lib/research/. Preserved legacy entrypoints, static vendor paths, IndexedDB identity, schema and protocol. Corrected the task-only source label to recognize `unavailable` as no vision.

Checks: nine unit tests; controlled-DOM/clock flow covering consent, demo, simulated completion/save and task-only interruption; local D1 API integration covering authorization, upload consent, deduplication, export, withdrawal and replay prevention. TypeScript checking and the final production build both passed.

Browser automation could not run because the available Playwright browser executable was absent and its download failed. Controlled-DOM checks are not real-browser/real-person validation. Real camera and Safari validation remain pending. No production deployment is part of this refactor.

Next task: Step 1 real-device/measurement QA; Step 2 module extraction is complete, but facial features, head events and their acceptance gates remain planned. Other contributors should extend domain modules rather than the compatibility facades.
