# W2.9A — Sites deployment architecture

Status: **Documented from this repository. Remote publication steps remain NOT_VERIFIED. Isolated preview D1 was not created.** Owner: Linxi. Caijia owns local functional testing. Scientific review remains Pending / Blocked.

## What the repo actually supports

| Piece | Evidence | Confidence |
|---|---|---|
| Sites project id | `.openai/hosting.json` `project_id` | Present in Git; whether it is production vs preview is **NOT_VERIFIED** |
| D1 binding name | `.openai/hosting.json` `"d1": "DB"` and `cloudflare-env.d.ts` | PASS |
| Local Worker entry | `build/sites-worker.ts` → `vinext/server/fetch-handler` | PASS |
| Local bindings | `vite.config.ts` injects placeholder D1 id `00000000-0000-4000-8000-000000000000` | PASS (local only) |
| Generated Wrangler | `npm run build` writes `dist/server/wrangler.json` | PASS after build |
| Local preview | `npm run dev` (vinext) or `npm start` (`wrangler dev --local`) | PASS |
| Local D1 migrate | `wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cool_groot.sql` | PASS (local) |
| Remote `wrangler deploy` | No package.json script | Intentionally absent |
| Sites UI publish | Starter says “follow the Sites skill” for publishing | **NOT_VERIFIED** |

This is a vinext/Sites Worker, not a standalone Next.js or Wrangler app. Do not add a `wrangler deploy` script. Hosted publication is a Sites control-plane action and is **REQUIRES CLOUD AUTHORIZATION**.

## Supported path (after Caijia local testing)

1. **SAFE LOCAL** — `npm run deploy:preflight`, `npm run build`, `npm start`, offline HTTP checks.
2. **REQUIRES CLOUD AUTHORIZATION** — create isolated D1, bind `DB` on a non-production Site, set preview secrets, publish through Sites.
3. **PRODUCTION FORBIDDEN** — reuse production D1 or session secrets, set `ALLOW_LIVE` / `OPENAI_API_KEY`, merge to `main`, or run remote Wrangler deploy.

Exact Sites UI labels and whether this `project_id` already has a preview slot cannot be confirmed from Git. Treat them as NOT_VERIFIED until a human with Sites access records them.

## Permissions (expected, not verified)

| Actor | Local | Cloud |
|---|---|---|
| Caijia | Functional/UI testing on `npm run dev` | None required for W2.9A |
| Linxi / deployer | Preflight, build, runbook | Sites project edit, D1 create/bind, secret write, publish, rollback |
| Agents | Documentation and offline checks | Forbidden without explicit approval |
