# Public research evidence UI / PR #22 review

Branch `feature/public-data-agent-ui`, stacked on PR #22 commit `6064ce8`.
No main/develop merge, public deployment, paid LLM or collection changes.

## Review outcome

PR #22 is suitable for limited descriptive source lookup, **not** fatigue-model training.
CC BY 4.0 attribution, versioned DOI, source-file IDs/hashes, modifications and privacy
selection are documented. All 20 numeric files pass their upstream MD5 and SHA256 checks.
The unknown excluded participant, missing fatigue labels and modality/protocol mismatch
remain scientific blockers; do not rename these files into a Focus Lab training cohort.
This is a bounded implementation/source review, not independent scientific acceptance.

The prior Node-only reader could not be imported directly into a browser or Worker UI
because it imports filesystem APIs. Split its pure evidence/query/context functions into
`analysis/src/neurolens/public-data/evidence.mjs` and retain its CLI exports unchanged.
The browser imports only this pure module and a build-time public JSON snapshot.
Tests compare every snapshot field/count to the hash-verified source catalog, avoiding
server filesystem access and any new public API, data upload, provider or authorization path.

## Use

Run local development as mock with live provider disabled, then open `/research-agent`.
This task's independent local server uses port 5184; the older demo on 5183 and game
on 4177 are unchanged.

The public-data section offers overview, exact board-record lookup with source counts,
and an explicit insufficient-evidence response to fatigue inference. Missing map entries
display “Not recorded”, not zero. Sources, SHA256, CC BY attribution and JSON evidence
are visible. Numbers are retrieved deterministically; no free-form model answer is generated.
The original authenticated synthetic demo stays in its own collapsed section and retains
its existing API allowlist. This public dataset is not personal local game data.

## Checks and limitations

Node suite: 177 passed (11 public-data/source/UI tests included); TypeScript and vinext
production build passed. `public-data-web-catalog.mjs --check` passed.
Browser interaction checks: overview, S1 source values/missingness and fatigue abstention.
Checks are software/data-fidelity checks, not fatigue or camera accuracy validation.
No training, fine-tuning, external model call or actual game/camera experiment.

Remaining: scientific task/label/exclusion review; a separately reviewed real local-session
path; optional controlled LLM integration; appropriate dataset for actual prediction.
Do not merge stacked UI work independently of PR #22 without resolving its base.
