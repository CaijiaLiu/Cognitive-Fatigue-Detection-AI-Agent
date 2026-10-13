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


## User-requested mission preview snapshot (2026-10-12 Vancouver)

Branch: `preview/mission-live-camera-v0.3`, based on main `3c3f0aa40464867489ddab6d50bc3b7d01349203`. Source: `previews/mission/`. This is a preservation/publishing handoff of the already-running independent preview, not a replacement of the modular collection base, a V2 acceptance claim, or a new production deployment.

Preserved behavior: English multi-screen consent/setup, 3-minute PVT-inspired and 4-minute Go/No-Go tasks, pre/between/post self-ratings, local storage/history/export, and persistent live camera/eye-state feedback during games. Task counts restart per mission; preview counters are transient. No-face/unavailable/stale states are explicit. Synthetic vision and the 40-second demo remain marked. Presentation version `mission-en-v0.3-live-eyes` is present in JSON and summary CSV. The separate preview IndexedDB identity and schema `mission-preview-1` are retained; V1 sessions/cloud writers/readers are not changed.

Checks rerun for this publication: `npm run check` and `npm test` in the preview; all 16 synthetic unit tests passed. Served `dist/` source matched the preserved snapshot byte-for-byte. Pinned MediaPipe assets matched existing repository blob SHAs and were reused with licenses. No browser self-play, camera access, new participant data, typecheck, full server build, or production integration test was run: the server and its dependencies were not changed. These checks do not validate detection accuracy or research sensitivity.

Limits: preview results are local-only; this schema is not wired into the private research backend. Existing public V1 remains unchanged. No participant exports, videos, screenshots, credentials, runtime databases, or preview hosting identity were added. No further gamification changes were made. Before resuming implementation, review integration into the canonical domain modules and coordinate schema/consent/server/export contracts; empirical real-device and measurement validation remains pending.
