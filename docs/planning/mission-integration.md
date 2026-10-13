# Mission preview integration plan

Updated 2026-10-13 Toronto. Source snapshot: [663ed79](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/tree/663ed797841e46cd2bc7779673d52a5120b1b9a3/previews/mission). Canonical runtime base: main 3c3f0aa.

## Scope and already-done work

The preview preserves an English journey, provisional PVT-inspired signal task (3 minutes), Go/No-Go cargo task (4 minutes), three fatigue self-ratings, live eye feedback, local results/history/export and a 20-second-per-task demo. Its 16 synthetic tests and syntax checks passed in this review.

It does not add facial blendshapes, screen-gaze calibration, thought probes, confounders, research statistics, ML or cloud submission. No whole-browser self-play or real-camera accuracy evidence is established.

## 1A — Stabilize before claiming readiness

- In dist/app.js onFeature, compute elapsed and discard captures before task.started. A frame captured before task onset can return asynchronously after start; current code passes the negative difference straight to the accumulator. Test the first frame, delayed frames and the transition between tasks.
- In dist/tracking.js, implement a standalone calibration deadline. The present 15-second check runs only on result messages; model-ready but stalled inference/video can wait indefinitely. Clear the deadline on ready, failure, stop and generation change.
- Test stale callbacks, stop/restart, missing frames and dropout. Keep no-face/unknown distinct from open eyes.

These are reviewed code risks awaiting fixes; do not report them as observed real-device failures.

## 1B — Experience verification

Verify consent -> setup -> pre rating -> PVT -> between rating -> Go/No-Go -> post rating -> report/history/export in all three modes. Test early stop, discard, storage failure, hidden/closed page, camera disconnect and slow inference. Verify both full durations and explicitly excluded demo sessions.

Check camera-card placement at small and large widths; it must not obscure stimulus/input/timer. Review whether stopping the camera during a task should interrupt or enter an explicitly documented task-only state; do not silently change data provenance. Confirm background camera policy between tasks.

Automated fixtures validate logic; real-browser journeys and real-camera measurements are additional gates.

## 1C — Canonical module port

| Existing preview file | Main destination / responsibility |
|---|---|
| mission.js task class and PVT summaries | tasks/ PVT adapter and pure summary |
| mission.js session/ratings | session/ record builder and phase coordinator |
| live-camera.js | reporting/ readout; consume shared FeatureAccumulator |
| tracking.js | tracking/ controller improvements |
| app.js/index.html/styles.css | Dedicated mission presentation composed with canonical engines |
| storage.js | persistence/ versioned reader/writer, explicit preview import adapter if needed |

Preserve the current collector route during integration. Keep vendor assets under one canonical owner, using an explicit asset-base option where adapters need different routes. Do not move or remove the historical snapshot until its references and any hosting dependencies are understood.

## 1D — Contract and optional cloud integration

Define a new supported schema for ordered tasks, timestamped pre/between/post ratings, protocol parameters, presentation/live-feedback settings, quality and task/session time mapping. Store task start/end offsets; a session wall-clock start plus task-relative samples alone cannot reconstruct intermissions.

Do not relabel mission-preview-1 as V1 schema 1.0.0. Keep old IndexedDB records/IDs intact; use explicit readers/imports and version guards. No automatic upload/migration of existing preview records.

Cloud integration changes participant consent, client DTO, server allowlist, database/export handling and tests together. Validate task/ratings completeness and source consistency. Retain upload acknowledgments, deduplication and participant withdrawal. Until this gate passes, mission results remain local-only.

## 1E — Measurement and research gate

Validate actual sampling, eye-state/blink accuracy and task timing on target devices/browsers. Record pilot limitations and null findings. Feedback-on sessions, provisional PVT, demo sessions and original V1 need distinct metadata; do not assume they measure interchangeable outcomes.

After this track, resume roadmap Steps 2–5: facial dynamics, calibrated coarse gaze, baseline/practice/probes/confounders and multimodal research integration. Statistics and ML remain Steps 6–7.

## Handoff and deployment

For each item record branch/commit, implemented source paths, tests actually run, pending device checks and contract impact in implementation-status.md. Read both branch heads before editing. This plan authorizes no automatic preview-code merge or website deployment.
