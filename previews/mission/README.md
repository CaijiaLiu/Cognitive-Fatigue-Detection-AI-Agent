# Focus Lab — Live Camera Mission Preview v0.3

Independent, owner-private experience prototype copied from the browser collection assets of deployed Focus Lab V1 (`ccc8aed1502d48c414cb4d49b7a33547836eeabc`). The original source backup is retained separately; the original Site, GitHub main branch and research database are not modified.

## Experience

Landing -> local collection consent -> camera/EAR preparation or explicit task-only/simulated-vision choice -> pre-task mental-fatigue rating -> signal-task instructions -> PVT-inspired game -> between-task rating -> sorting-task instructions -> Go/No-Go game -> post-task rating -> local results/history and JSON/CSV exports.

Camera and inference remain browser-local. No video recording, no image storage and no participant-data upload endpoints. The consent explicitly says that this copy does not send results to the original private research dashboard. Its IndexedDB database and participant-ID storage key are independent from V1. The Site is intended to stay owner-private while the game design is reviewed.

Live camera mode now displays calibrated **Open / Closed** eye estimates, completed blink count, blink rate, accumulated closed time, and valid tracking coverage in preparation and throughout both games. On large screens the card stays in the upper-right corner, with space reserved beside the task; on smaller screens it sits above the game so it cannot cover the stimulus or timer. No-face, unavailable-eye, and stale-frame states are explicit rather than being reported as open eyes.

Preparation/intermission counters are transient preview feedback, not exported research samples. Each task uses a fresh accumulator. The display reads the same eye-state hysteresis and blink detector as the stored task features. Synthetic vision is visibly labeled; no live video is fabricated. The JSON/summary CSV includes a separate presentation version and live-feedback flag, because feedback changes the participant experience even though task rules, timings, and feature algorithms are unchanged.

## Scientific boundaries

- Full experience: 3-minute PVT-inspired signal task and 4-minute Go/No-Go task. The first is a provisional browser protocol, not a certified PVT-B. Its random wait, feedback and timeout parameters are explicit in `dist/mission.js`. It is not identical to the published PVT-B protocol.
- Go/No-Go preserves V1's 75% Go probability, 1000 ms response window and 600–1300 ms inter-trial wait, with a game skin. It is not renamed as standard SART.
- Demo: 20 seconds per task, `purpose: demo`. Exclude demo sessions from empirical validation and model training. Visual sources are independently labeled camera/simulated/unavailable; task inputs and explicit self-ratings are not fabricated.
- Three 1–10 mental-fatigue ratings are stored separately with timestamps. No fatigue prediction, medical diagnosis, population ranking or inferred focus meter is produced.
- Vision retains V1's approximately 10 Hz inference and research-proxy algorithms. EAR preparation is not screen-gaze calibration. Real camera accuracy and clinical validity remain unverified.
- Timer tests use injected clocks; visual UI demo tests are not real-person validation. Hidden-page events interrupt the session; no silent timer resume. During an exit prompt, the task clock keeps running as disclosed.

## Local development

Requires Node.js, no installation needed:

```sh
npm test
npm run check
npm run dev
```

Open `http://127.0.0.1:4177/?ui=mission-en-v0.3-live-eyes`, or double-click `Launch English Preview.command`. The header must say **LIVE CAMERA EN · v0.3**. The interface remains English. Task rules, durations, measurement logic, protocol version, and storage keys are unchanged.

Port 4177 separates this edition from older local servers on ports 4173/4176. Browser storage is origin-specific: previous local sessions remain at their previous address and are not copied or deleted. This preview is not currently published. The original public URL still serves the original V1. There are no cloud-upload endpoints in this preview; connecting the new session schema to the private dashboard is separate work requiring participant upload consent and coordinated server/export changes.

This live-camera revision is checked with synthetic unit fixtures and syntax checks, without enabling a camera, playing a task, or collecting new participant data. A local HTTP readiness check is not a game test. Real camera detection accuracy, responsiveness, and responsive layout remain for user verification. Browser/OS camera permission still requires the user. Do not copy production credentials or participant records into this checkout.

Camera and model files, feature extraction and IndexedDB storage originated in V1. Keep third-party licenses under `dist/vendor/`. New code: `dist/mission.js` (timed tasks and exports), `dist/tracking.js` (local tracking adapter), `dist/app.js` (screen workflow), `dist/styles.css` and `dist/index.html` (presentation), and `tests/mission.test.mjs` (synthetic unit fixtures).
