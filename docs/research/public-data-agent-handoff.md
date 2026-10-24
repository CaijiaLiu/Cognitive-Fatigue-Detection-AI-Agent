# Public-data evidence handoff (2026-10-23)

User requested a redistributable public dataset, a new GitHub branch and material for
the AI agent to learn from. Implemented as **retrieval of real source evidence**, not
LLM weight updates, paid inference or fatigue-model training.

Branch: `data/cognitive-lab-agent-evidence`; base `develop/neurolens-agent` at
`3b7528fbc1ce3403d2704647ea6624d18305199b`. Main, preview and other workstreams untouched.

Read [dataset attribution, use and limits](../../analysis/datasets/cognitive-lab/README.md).
Reader: `analysis/src/neurolens/public-data/cognitive-lab.mjs`.
CLI: `scripts/public-data-agent.mjs`. Tests: `tests/public-data-cognitive-lab.test.mjs`.

## Why this source

Figshare Cognitive Fatigue v3 explicitly declares CC BY 4.0, unlike the restrictive
DROZY agreement and access-restricted UL-DD. Import only all 20 small board-result JSONs
(6,755 original bytes) and a provenance manifest; exclude all media, demographics and
interaction logs. Source hashes were verified at download. This is a subset from a
fatigue study, not a ready fatigue-labeled training table.

## Agent workflow

Run `node scripts/public-data-agent.mjs overview`, then `board SOURCE_FILENAME`.
Read the structured evidence and its limitations. `fatigue` explicitly abstains.
Use source DOI, record reference, URL and SHA256 to trace any statement. Do not combine
this external protocol with local Go/No-Go/PVT or overwrite the existing agent contracts.

## Remaining work

Scientific review of task meaning and excluded participant identity is pending.
Actual model training and independent outcome prediction are not implemented or validated.
HTTP/UI integration needs an explicit reviewed public-data contract; the running
synthetic demo and v0.3 game remain unchanged. No deployment, recruitment, OpenAI spend,
publication of our own participant data or model performance claim is authorized here.
