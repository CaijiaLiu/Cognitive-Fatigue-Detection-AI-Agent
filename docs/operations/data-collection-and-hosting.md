# Focus Lab V1 hosted research MVP

Public collection page: `/collection/index.html`. Private researcher page: `/research`.
Sites owns sign-in and trusted request identity. Only the account matching the secret runtime `RESEARCHER_EMAIL` may view, export or delete results. The public Site audience does not make D1 records public.

Video frames and face landmarks are processed locally and are not recorded or uploaded. No existing local sessions are migrated. Only a newly completed/interrupted session with post-rating and a separate unchecked-by-default upload consent can be sent. Browser environment and free-text events/notes are omitted client-side and stripped server-side. The allowlisted DTO contains anonymous IDs, timestamps, pre/post self-ratings, numeric visual features, task trials, summaries and protocol configuration. IDs remain linkable within a browser and are pseudonymous, not guaranteed anonymous.

Anonymous writes require an expiring, session-scoped 256-bit upload capability. Origin checks, 2 MB streamed body limits, array limits, schema validation, per-connection hourly ticket limits and a global 500/day ticket limit provide prototype abuse bounds. Only salted hourly IP hashes are kept in short-lived rate-limit buckets; raw IPs are not stored in the research database. Infrastructure may keep its own logs. This is not a hardened clinical-production recruitment platform or an ethics-approved study.

The browser retains a separate 256-bit withdrawal capability before transmission. Server-side results are idempotent by session ID, cannot be overwritten, and can be deleted using this capability or by the authorized researcher. Server confirmation is required before reporting success. Failed uploads are retried only by an explicit participant click. Existing exports are not revoked by deletion. Records remain until participant/researcher deletion; no automatic retention policy is configured.

Researcher export is paginated at 10 records per page for Worker memory bounds; JSON, session CSV, sample CSV and trial CSV are available. JSON retains explicit data provenance. `simulated` vision is never represented as camera data. UI-driven development test task input may be automated; it is not a human-study validation result.

Local development: install with the Sites dependency helper, run `npm run db:generate` after schema changes, build through the Sites helper, apply the generated migration locally following the starter README, then `npm run dev -- --port 5173 --hostname 127.0.0.1`. `.dev.vars` is ignored and contains development-only values. Production secrets are configured only through Sites. Do not upload `.wrangler`, browser storage, screenshots, captured media, credentials, local test records or `.dev.vars`.

Checks: `node --test tests/research.test.mjs`, `node tests/integration.mjs` against local dev, `npx tsc --noEmit`, and the Sites build helper. Integration constructs new synthetic fixtures and removes their local D1 result at completion. Never run this integration test against production.

Future ML: use exported schema version and protocol version; retain missing samples and quality flags. Separate genuine camera features from simulated vision; split train/test by participant ID, not by individual frames or trials. Treat fatigue self-report as a subjective research label, not diagnostic ground truth. Introduce validated labeling/calibration and held-out evaluation before any predictive interpretation. V1 offers no diagnostic or fatigue prediction score.
