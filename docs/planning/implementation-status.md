# Implementation status

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
