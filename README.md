# Cognitive-Fatigue-Detection-AI-Agent

## Focus Lab · V1 Data Collection Web App

A web prototype for exploratory cognitive fatigue research. **It is not a medical diagnostic tool and does not provide a predicted fatigue score.** V1 focuses on collecting analyzable research data; it does not train a machine learning model.

- [Public test app](https://focus-lab-cognitive-v1.sassyhen16.chatgpt.site)
- [Private researcher dashboard](https://focus-lab-cognitive-v1.sassyhen16.chatgpt.site/research): only an authorized researcher account can view, export, or delete results.

### Features

- Informed consent for local data collection and camera permission; MediaPipe face/eye inference and video-frame processing run in the browser.
- Blink counts, eye-closure duration, head movement, and an uncalibrated iris-position variability proxy, with numerical sampling at approximately 10 Hz.
- A Go / No-Go attention task that records reaction times, accuracy, omissions, false alarms, and invalid trials.
- Pre- and post-task fatigue self-ratings on a 1–10 scale, an anonymous browser ID, a session UUID, and timestamps.
- Local storage in IndexedDB, JSON / CSV exports, and a session dashboard.
- Separate upload consent, unchecked by default; server acknowledgments, manual retries, session deduplication, and a credential for withdrawing a cloud submission.
- Sites platform sign-in, server-side researcher authorization, D1 storage, and paginated exports.
- Three modes: real camera, simulated visual features, and task-only. Simulated features are always explicitly labeled.

### Privacy Boundaries

Camera footage is not recorded, saved, or uploaded. Existing local sessions are not automatically migrated to the cloud. Only after completing a new session, separately consenting to upload, and saving it are the anonymous ID, timestamps, self-ratings, task performance, and numerical visual features submitted. The server uses a field allowlist and does not store videos, photos, raw facial landmarks, browser information, or free-text events.

The anonymous ID can link sessions from the same browser, so it is a linkable research identifier, not a guarantee of complete anonymity. The hosting platform may process connection logs. Uploaded records are retained until deleted by the participant or researcher; deletion cannot automatically recall files already exported. This repository contains no participant records, development databases, screenshots, videos, or production secrets.

### Run Locally

Requires Node.js ≥ 22.13.0. This version was verified with Node.js 24.

```sh
npm run install:ci
npm run build
```

Create a `.dev.vars` file for local development. Do not commit it to Git:

```text
RESEARCHER_EMAIL="seedy@sites.test"
RATE_HASH_KEY="choose-a-development-only-random-value"
```

Initialize the **local** database, then start the preview:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cool_groot.sql
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:5173/collection/index.html`. The local platform sign-in simulation uses `seedy@sites.test`; it is not production authentication. Production sign-in is provided by Sites. Production values for `RESEARCHER_EMAIL` and `RATE_HASH_KEY` are stored only on the hosting platform, not in the source code. Static GitHub Pages cannot run this version's private dashboard or D1 API: GitHub hosts the source code, while Sites runs the live application.

Camera access requires HTTPS or localhost, plus browser and operating-system permission. Real camera capture in Safari still needs verification on an actual device. Simulation does not validate camera hardware or the ability to detect fatigue.

### Tests

```sh
node --test tests/research.test.mjs
npx tsc --noEmit
npm run build
# Run after starting the local preview above; do not run integration tests against production.
node tests/integration.mjs
```

Completed verification: five data-validation tests, type checking, a production build, local consent gating, authorization, deduplication, exports, withdrawal, replay protection, and a 30-second browser flow using simulated visual features. The original local MVP's 12 core/camera-interface tests also passed. The deployed page, model, and WASM assets are accessible; unauthenticated exports are rejected, the researcher dashboard redirects to platform sign-in, and upload-ticket configuration works. These checks do not establish real-person camera capture, production owner sign-in, or medical validity.

### Project Structure and Future ML Integration

- `public/collection/`: browser-side collection and visualization.
- `app/api/`: upload and protected endpoints.
- `app/research/`: private researcher dashboard.
- `db/` and `drizzle/`: database schema and migrations.
- `lib/research-data.mjs`: upload field allowlisting and data-source validation.

Future model training can consume the exported JSON / CSV data. Exclude simulated visual features, preserve missing values and quality flags, split training and validation sets by participant ID rather than by frame or trial, and establish reliable labels and independent evaluation. Changes in blinking or fatigue self-ratings must not be treated as medical diagnoses.

See [Research Data and Deployment Notes](RESEARCH.md) and [Framework and Local D1 Notes](docs/STARTER.md) for additional details. Third-party model and dependency licenses are retained in the corresponding license files under `public/collection/vendor/`, `vendor/`, and `build/`.
