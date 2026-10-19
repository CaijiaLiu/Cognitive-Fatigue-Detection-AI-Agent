# Sites Preview deployment runbook

Preparation only. This document does not authorize cloud changes. Caijia owns local functional testing. Linxi owns deployment architecture.

Every step is labeled:

- **SAFE LOCAL** — allowed on a laptop or CI without cloud credentials
- **REQUIRES CLOUD AUTHORIZATION** — needs an explicit human go-ahead
- **PRODUCTION FORBIDDEN** — never do this for W2.9A / preview

## Prerequisites

**SAFE LOCAL**

- Node.js `>=22.13.0`
- This branch merged or based on `develop/neurolens-agent`
- Caijia local testing complete, or the deployer is only preparing artifacts (not publishing)
- `npm run deploy:preflight` exits 0

**REQUIRES CLOUD AUTHORIZATION**

- Access to the OpenAI Sites project that should host **preview**, not production
- Permission to create a D1 database and bind it as `DB`
- Permission to set Worker/Sites secrets
- Permission to publish and to roll back / unpublish

**PRODUCTION FORBIDDEN**

- Using the production collection D1
- Reusing production `NEUROLENS_DEMO_SESSION_SECRET` or `RATE_HASH_KEY`
- Setting `NEUROLENS_AGENT_ALLOW_LIVE` or `OPENAI_API_KEY`
- Merging this work to `main` as a deploy step

## Required permissions

**NOT_VERIFIED** from Git. The Sites project id in `.openai/hosting.json` is `appgprj_6acaec7d9eb08191add47386ff5a463d`. Whether that id is production, preview-capable, or both must be confirmed by a human in the Sites console.

## Cloudflare / Sites environment

**SAFE LOCAL**

```sh
npm run install:ci
npm run deploy:preflight
npm run build
npm start
```

`npm start` is `wrangler dev --local` against `dist/server/wrangler.json`. It does not publish.

**REQUIRES CLOUD AUTHORIZATION**

Publication is through the Sites control plane (“follow the Sites skill” in `docs/operations/STARTER.md`). This repository does not contain a supported remote deploy command.

**PRODUCTION FORBIDDEN**

```sh
# Do not add or run:
# wrangler deploy
# wrangler d1 execute DB --remote
# wrangler secret put OPENAI_API_KEY
```

## Isolated D1 provisioning

Proposed name (not created): `neurolens-preview-d1`  
Binding name: `DB`  
Schema file: `drizzle/0000_cool_groot.sql` (only migration; idempotent `CREATE TABLE`)

**SAFE LOCAL** — apply to Miniflare only:

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cool_groot.sql
```

**REQUIRES CLOUD AUTHORIZATION** — human creates an empty D1, binds it as `DB` on the preview Site, then applies the same SQL **to that database only**. Do not copy production `research_sessions`.

Verification queries (run only on the preview D1):

```sql
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
SELECT COUNT(*) AS demo_keys FROM upload_limits WHERE key LIKE 'demo:%';
SELECT COUNT(*) AS research_rows FROM research_sessions;
```

Expected: tables `upload_limits`, `research_sessions`, `upload_tickets`; `demo_keys` and `research_rows` start at 0.

Cleanup (preview D1 only):

```sql
DELETE FROM upload_limits WHERE key LIKE 'demo:sess:%' OR key LIKE 'demo:rl:%';
```

Demo SQL already scopes automatic expiry cleanup to those prefixes, so collection ticket keys are not swept if someone mistakenly shares a database. Sharing remains **PRODUCTION FORBIDDEN**.

Rollback: unbind the preview D1 and delete `neurolens-preview-d1` after approval. Do not delete production `DB`.

## Preview secret setup

Template: [preview.env.example](preview.env.example). Names only in Git.

**SAFE LOCAL** — copy to ignored `.dev.vars` for `npm start`. Use development-only values.

**REQUIRES CLOUD AUTHORIZATION** — set the same **names** on the preview Site. Generate new password and secrets. Do not paste them into issues, PRs, or chat.

**PRODUCTION FORBIDDEN** — `OPENAI_API_KEY`, `NEUROLENS_AGENT_ALLOW_LIVE`, production researcher/upload secrets.

Required names:

- `NEUROLENS_DEMO_DEPLOYMENT=preview`
- `NEUROLENS_DEMO_D1_ISOLATED=1`
- `NEUROLENS_DEMO_PASSWORD` (≥16, not a known weak value)
- `NEUROLENS_DEMO_SESSION_SECRET` (≥32)
- `NEUROLENS_DEMO_RATE_SECRET` (≥16)
- `NEUROLENS_AGENT_PROVIDER=mock`

## Build and publication

**SAFE LOCAL**

```sh
npm run build
npm run deploy:preflight
```

After build, preflight can mark `build_artifacts` PASS if `dist/server/wrangler.json` binds `DB`.

**REQUIRES CLOUD AUTHORIZATION**

Publish the built Site through Sites. Record the preview URL in implementation-status only after it exists. There is no in-repo command that does this.

**PRODUCTION FORBIDDEN** — publishing this configuration onto the production Site or `main`.

## Remote verification checklist

**REQUIRES CLOUD AUTHORIZATION** and an approved URL. Until then: **REMOTE E2E: NOT RUN**.

Use [preview-verification.md](preview-verification.md). Do not print cookies. Caijia may later own browser/functional checks; this runbook does not replace that work.

Expected HTTP:

| Request | Status |
|---|---|
| POST `/api/research-agent` no cookie | 401 |
| Wrong password | 401 |
| Login | 200 + HttpOnly cookie |
| Fixture ask | 200 |
| Hidden/unknown session | 403 |
| Client evidence/provider | 400 |
| Rate-limit exhaustion | 429 |
| Replay after logout | 401 |
| openai configured | 503 |

## Rollback

**REQUIRES CLOUD AUTHORIZATION**

1. Unpublish or restore the previous Sites deployment.
2. Rotate preview secrets if they leaked.
3. Optionally drop the preview D1 after approval.

**SAFE LOCAL** — `git checkout` back to `develop/neurolens-agent`.

**PRODUCTION FORBIDDEN** — rolling forward by merging to `main`.

## Common failures

| Symptom | Likely cause | Class |
|---|---|---|
| Preflight FAIL `live_provider_disabled` | `ALLOW_LIVE` in the shell | SAFE LOCAL: unset it |
| 503 on preview | Missing secrets, openai, or no shared D1 | REQUIRES CLOUD AUTHORIZATION to fix bindings |
| 401 after login | Cookie path or Secure on HTTP | SAFE LOCAL: use HTTPS preview or local `npm start` |
| Collection data visible | Preview bound to production `DB` | PRODUCTION FORBIDDEN; rebind isolated D1 |
| Sites publish button missing | Insufficient permission or wrong project | NOT_VERIFIED; human confirms console |

## Troubleshooting

**SAFE LOCAL** — `npm run deploy:preflight`, `npm run verify:preview-http`, inspect `dist/server/wrangler.json` for `binding: "DB"`.

**REQUIRES CLOUD AUTHORIZATION** — Sites/Workers logs filtered to `"event":"research_agent"`. Do not paste secrets.

**PRODUCTION FORBIDDEN** — opening production D1 to “just check” preview keys.
