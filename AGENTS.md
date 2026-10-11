# Shared agent and contributor instructions

## Read first

Read README.md, docs/README.md, docs/architecture/overview.md, docs/planning/implementation-status.md and docs/planning/roadmap.md before implementation. Read data-contracts.md and affected research/operations documents before changing collection or analysis.

NeuroLens is the target platform; Focus Lab is the existing V1 app. Both refer to this repository. Current implementation is research data collection, not fatigue prediction or medical diagnosis.

## Coordination

Agents do not automatically share private conversations. The durable shared context is committed code, these documents, issues and PRs. Do not claim direct communication with another AI unless an actual channel was used.

At task start, inspect branch, latest commit, working tree and open relevant changes. Avoid overwriting another contributor's work. Agree on non-overlapping paths when collaborating; preserve unrelated edits. User instructions govern task scope. Do not deploy, change audience, recruit participants or rewrite infrastructure merely because planning documents mention future capabilities.

After each implemented step, update implementation-status.md with source evidence, checks, limitations and next task. Update roadmap/architecture if design changes. Distinguish planned, implemented and validated. Never mark a step complete just because documentation or a simulated demo exists.

## Architecture and placement

Use docs/architecture for design, docs/research for protocols/features, docs/planning for steps/status and docs/operations for deployment/privacy. Original proposal in docs/reference is historical; merged architecture is canonical.

Preserve current browser entrypoints and asset URLs. Extract modules incrementally according to repository-layout.md. Do not duplicate code in version folders, create empty placeholders, add a Python backend by default or move build/vendor assets casually.

## Data and science

No participant videos/photos, identifiable exports, production databases, withdrawal/upload tokens or secrets in Git. Keep camera inference local and default uploads opt-in. Preserve separate collection/upload consent and withdrawal behavior.

Version schemas, protocols, feature algorithms and models independently. Change client writers, cloud allowlists, export readers and tests together. Keep old sessions readable. Preserve missingness and provenance. Simulated data cannot establish empirical performance.

EAR calibration is not gaze calibration. Blendshape scores are facial-action proxies, not direct muscle activation or psychological labels. Unstable gaze is not proof of mind wandering. Do not generate ADHD diagnoses/probabilities or claim clinical validation.

Labels come from explicit self-reports/task definitions. Use only pre-probe windows. Split by participant/group; training-only preprocessing. Report uncertainty, class balance and independent participant counts. Insufficient data is a valid reason to defer prediction claims.

## Verification and handoff

For documentation-only work: verify paths, relative links, historical provenance and plan/status consistency; no application deployment is needed.

For runtime changes: run relevant unit tests, npx tsc --noEmit and npm run build as appropriate. Local API integration tests require initialized local D1 and preview; never run tests/integration.mjs against production. Real camera changes need real-device checks; simulated tests do not replace these.

The existing five research tests cover payload validation, not blink accuracy. README historical checks are not evidence that the current task reran them.

Final handoff: commit/PR, changed behavior/files, actual checks, pending validation and next step. Do not imply a website changed when only repository documentation changed.

## Current module boundaries

Collection implementation is under public/collection/{tracking,features,tasks,session,reporting,persistence,shared}. app.js/core.js/camera.js/storage.js/cloud.js and the server lib facades are compatibility entrypoints: add implementations to domain modules. Keep classic Worker bootstrap and vendor URL base stable.

Tracking and task controllers own their resources/state and receive callbacks from session/controller.js. Do not introduce reverse imports into the coordinator. Keep statistics, feature extraction and exports DOM-free for research/server reuse. The schema and IndexedDB name are unchanged by module extraction.

Run npm test and npm run test:flow for collection changes. Flow tests use controlled DOM/clock and memory storage, not a real browser. Preserve the separate local D1 integration and actual-device validation requirements.
