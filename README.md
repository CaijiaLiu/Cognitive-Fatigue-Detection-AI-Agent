# Cognitive-Fatigue-Detection-AI-Agent

## Connected local game and results reader

On `feature/game-agent-local-bridge`, run `npm run install:ci`, then
`npm run dev:connected`. Open `http://127.0.0.1:5185/mission/index.html` to play.
After saving, use the result page's Agent link, then click **Load my local game sessions**.
The Agent at `http://127.0.0.1:5185/research-agent` reads and recalculates local task
results, or opens one explicitly selected JSON export without saving/uploading it.
Existing records at port 4177 remain there; no automatic migration.
No LLM call, fatigue model, public deployment or change to main.
See [contract, privacy and validation limits](docs/architecture/local-game-agent-bridge.md).

## Public research data branch — real evidence, not model training

This branch adds a small CC BY 4.0 numeric subset from *Cognitive Fatigue* (Figshare v3).
See [dataset source, attribution and use](analysis/datasets/cognitive-lab/README.md) and
[AI-agent handoff](docs/research/public-data-agent-handoff.md).
Run `node scripts/public-data-agent.mjs overview` or `board SOURCE_FILENAME`.
The UI branch adds a real-source lookup section to `/research-agent`; the original
synthetic demo remains separately labeled and folded below. It does not train an LLM
or validate fatigue prediction. See [UI review and usage](docs/research/public-data-ui-review.md).

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
NEUROLENS_DEMO_DEPLOYMENT="local"
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
npm test
npm run test:integration
npm run test:reliability
npm run test:runtime
npm run test:agent-api
npm run test:llm
npm run test:demo-security
npm run test:preview
npm run verify:preview-http
npm run deploy:preflight
npm run test:flow
npx tsc --noEmit
npm run build
# Run after starting the local preview above; do not run collection/cloud integration tests against production.
node tests/integration.mjs
```

`npm run test:integration` is the offline W1.6 pipeline (V1 export → adapter → tools → prompt → validator). `npm run test:reliability` / `npm run eval:reliability` run W1.7 adversarial and metamorphic contract tests. `npm run test:runtime` runs the W2.1 mock-provider orchestrator. `npm run test:agent-api` runs the W2.2 HTTP handler and demo view-model tests. `npm run test:llm` / `npm run eval:llm` run the W2.3/W2.4 provider config and mock evaluation suite. They need no LLM API key and no network. Real OpenAI calls require `NEUROLENS_AGENT_PROVIDER=openai`, `OPENAI_API_KEY`, and `NEUROLENS_AGENT_ALLOW_LIVE=1`. `--live` is a dry-run. Paid evaluation is `NEUROLENS_AGENT_ALLOW_LIVE=1 npm run eval:llm -- --plan live-12 --live --execute --out /tmp/nl-llm-live.json` and is never part of `npm test`. They are not `tests/integration.mjs` (local D1 / collection cloud). The synthetic Research Agent demo is `/research-agent`. Public demo authentication and rate limits are documented in [docs/operations/public-demo.md](docs/operations/public-demo.md). `npm run test:demo-security` is offline.

Completed verification: five data-validation tests, type checking, a production build, local consent gating, authorization, deduplication, exports, withdrawal, replay protection, and a 30-second browser flow using simulated visual features. The original local MVP's 12 core/camera-interface tests also passed. The deployed page, model, and WASM assets are accessible; unauthenticated exports are rejected, the researcher dashboard redirects to platform sign-in, and upload-ticket configuration works. These checks do not establish real-person camera capture, production owner sign-in, or medical validity.

### Project Structure and Future ML Integration

- `public/collection/`: browser-side collection and visualization.
- `app/api/`: upload, protected researcher, and synthetic Research Agent endpoints.
- `app/research/`: private researcher dashboard.
- `app/research-agent/`: synthetic Research Agent demo (fixtures + mock provider).
- `db/` and `drizzle/`: database schema and migrations.
- `lib/research-data.mjs`: upload field allowlisting and data-source validation.

Future model training can consume the exported JSON / CSV data. Exclude simulated visual features, preserve missing values and quality flags, split training and validation sets by participant ID rather than by frame or trial, and establish reliable labels and independent evaluation. Changes in blinking or fatigue self-ratings must not be treated as medical diagnoses.

See [Research Data and Deployment Notes](RESEARCH.md) and [Framework and Local D1 Notes](docs/STARTER.md) for additional details. Third-party model and dependency licenses are retained in the corresponding license files under `public/collection/vendor/`, `vendor/`, and `build/`.

## Architecture and implementation plan

Focus Lab is the existing V1 collection application; NeuroLens names the broader ocular, facial and behavioral research platform. V2/V3 are planned milestones, not implemented features.

- [Documentation index](docs/README.md)
- [Merged architecture](docs/architecture/overview.md)
- [Implementation steps and release gates](docs/planning/roadmap.md)
- [Implemented versus planned capabilities](docs/planning/implementation-status.md)
- [Repository file locations](docs/architecture/repository-layout.md)
- [Shared agent/contributor instructions](AGENTS.md)

## Modular collection base

The stable entrypoint is `public/collection/app.js`. Implementations are grouped by responsibility:

| Folder | Responsibility |
|---|---|
| `tracking/` | Camera access, Worker inference and tracking lifecycle |
| `features/` | Ocular/head feature extraction, accumulation and missing-vision summaries |
| `tasks/` | Go/No-Go task adapter and performance summaries |
| `session/` | Orchestration, data-source labels, version constants and synthetic demo |
| `reporting/` | Dashboard, formatting, downloads and shared CSV exports |
| `persistence/` | Local sessions and consented cloud upload/withdrawal |
| `shared/` | Pure statistics helpers |
| `lib/research/` | Server authorization/request helpers and upload validation |

Legacy module paths remain thin compatibility facades. Schema 1.0.0, IndexedDB database name and task protocol remain unchanged. `npm run test:flow` exercises the collection module graph with a controlled DOM/clock and memory persistence; it does not validate real-browser hardware or IndexedDB.

Offline read-only analysis tools and the V1 export adapter live under `analysis/src/neurolens/`. They consume already-exported JSON or synthetic fixtures and do not change collection, consent, or cloud paths.
