# Data flow

## Existing V1

1. Participant chooses camera, simulated vision or task-only mode and gives local collection consent.
2. Camera frames are processed in the browser Worker; no video recording is implemented. EAR calibration estimates natural-open-eye baseline.
3. Go/No-Go events and visual samples use elapsed monotonic time relative to session start; wall-clock dates identify the session.
4. IndexedDB stores snapshots and final records. Local JSON/CSV exports are available.
5. A separate unchecked upload consent permits upload of that session. The browser retains a withdrawal capability before transmission.
6. Server validates and allowlists fields, checks a session-scoped upload capability, and saves idempotently in D1.
7. Authorized researcher can inspect, page, export and delete records; participant can withdraw using their capability.

Existing source: public/collection/{camera.js,tracker.worker.js,core.js,app.js,storage.js,cloud.js}, app/api/, app/research/, lib/research-data.mjs.

## Target additions

Phase/event timestamps join ocular, facial, head, task and self-report observations. Probe windows end before prompt onset; answering a probe must not become a predictive input for that label. Video playback uses media time mapped to session elapsed time, including pause/seek events.

Exports feed a reproducible offline pipeline: validate -> provenance filtering -> quality checks -> windowing -> labels -> grouped split -> training-only preprocessing -> statistics/models -> report.

The W1.4 adapter is a bounded first step of that export boundary: validated V1 JSON is copied into versioned evidence artifacts for the read-only agent tools. It is not the statistics/model pipeline and is not scientific validation.

Derived results retain input IDs, schema/protocol/algorithm versions and exclusion reasons. Reports distinguish unavailable, poor-quality and simulated observations.

## Privacy

No raw video, screenshots or identifiable participant records belong in Git. Simulated fixtures are explicitly synthetic. New uploaded numeric features require client export, server allowlist, validation, consent copy and tests to change together. Existing records are not silently uploaded or rewritten. Deleting cloud records cannot recall previously exported copies.
