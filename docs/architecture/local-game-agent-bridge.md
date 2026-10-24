# Same-origin local game → evidence bridge

User-requested branch: `feature/game-agent-local-bridge`, based on UI PR #23
`2602797e59cdf675adb2f6b721aae8411c6804cb`. No main/develop merge or public deployment.

## Paths and boundaries

`npm run dev:connected` creates an ignored `public/mission` directory link to the
preserved snapshot at `previews/mission/dist` and starts the app on 127.0.0.1:5185.
No duplicate tracking/feature engine is copied under public. The snapshot is sourced
from preview commit `663ed79`; only a navigation helper is added to its results page.
This is a bounded local connection to the user's existing preview, not the canonical
mission-engine port or a completion of integration phases 1A–1E.

- `/mission/index.html`: original English two-game preview, local camera feedback,
  consent, per-task trial records, IndexedDB `focus-lab-mission-preview-v1`.
- Results page: new explicit link to `/research-agent#local-results`; no data in the URL.
- `/research-agent`: user clicks Load to read this origin's saved completed/interrupted
  records; drafts/unsupported/corrupt entries are skipped with a count. Select a session
  and ask a supported descriptive question.
- An explicitly chosen JSON file (single record, ≤2 MB) may be opened in page memory.
  It is not persisted, migrated, uploaded or sent to an LLM. Clear view forgets the
  in-memory view, not saved records. No developer-created session is inserted into IDB.

Old 4177/5183/5184 origins retain their own databases. Do not promise cross-port access.
Use the same browser/address for new play and reading. Existing 4177 records require a
user-initiated export and local file selection; no automatic migration is attempted.
All original entrypoints and production V1 cloud semantics remain unchanged.

## Versioned evidence contract

`mission-local-evidence/0.1` accepts only `mission-preview-1` /
`mission-exploratory-v1`, expected local consent, human behavior, self-report ratings,
recognized camera/task-only/simulated source combinations and bounded finished tasks.
It validates trial identity, source, response/correctness/timing and nullable ratings.
Completed sessions require two completed tasks and three ratings; interrupted records
may retain partial tasks/missing ratings. No coercion to V1 or public-research schemas.

Task summaries are recalculated using the preview's **existing** `taskSummary` function.
No second summary implementation. Differences from stored summaries produce a warning;
stored summary values never override recomputed trial results. Missing stays null.
Tasks/protocols and their independent clocks remain separate.

Only selected task summaries, ratings, session reference/date/status and provenance are
returned. Participant ID, raw camera samples, landmarks, arbitrary notes, tokens and
unrecognized fields are omitted. This is validation/redaction, not proof of authenticity:
a local user can edit their own exported file. No clinical or predictive inference.

The read-only browser store helper never upgrades or writes: a missing DB creation is
aborted, connections close, and blocked/unavailable/error conditions are explicit.
No new API or server-side allowlist is added. The original synthetic HTTP demo and public
dataset section remain independent. No real-LLM call or model training is connected.

## Checks / pending validation

189 root Node tests (12 new bridge tests), 16 preserved preview tests, typecheck, production
build and controlled-DOM collection flow passed. Synthetic fixtures exercise producer
records → evidence → query, schema/source/timing rejection, summary tampering, sparse
missingness, privacy, size limits and readonly/missing/blocked storage.
Local HTTP checks confirm both game assets/navigation helper and Agent are served at one
origin. No real session/camera accuracy is established. We did not play the user's games,
read old browser data, upload participant results or call OpenAI.

The preview's known timing/calibration measurement limitations remain; the canonical
tracking foundation fixes on develop are not silently claimed for this snapshot.
Real-device/user verification and later canonical port remain separate gates.
Public hosting, cloud DTOs, live LLM, fatigue prediction and generalization remain out of scope.
