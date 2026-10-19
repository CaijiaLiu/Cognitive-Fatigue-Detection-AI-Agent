# W2.8 — Cloudflare preview architecture

Status: **Audited and configured in-repo. Isolated preview D1 was not created. Remote deploy was not authorized.** Owner: Linxi. Depends on W2.7 (PR #13, merged to `develop/neurolens-agent` @ `f18e46e`). Scientific contracts, collection access, and Caijia review are unchanged.

## Phase 1 audit (actual repository)

This is not a conventional Next.js deploy. vinext compiles RSC routes into a Cloudflare Worker.

| Piece | Reality |
|---|---|
| Framework | vinext + Vite 8 + `@cloudflare/vite-plugin` |
| Worker entry | `build/sites-worker.ts` → `vinext/server/fetch-handler` |
| Local bindings | `vite.config.ts` reads `.openai/hosting.json` (`d1: "DB"`) and injects a placeholder D1 id |
| Generated Wrangler | `dist/server/wrangler.json` after `npm run build`. There is no root `wrangler.toml` / `wrangler.jsonc` |
| Local run | `npm run dev` (vinext) or `npm start` (`wrangler dev --config dist/server/wrangler.json --local`) |
| D1 schema | `drizzle/0000_cool_groot.sql`: `upload_limits`, `research_sessions`, `upload_tickets` |
| Secrets | Sites / `.dev.vars`. Names only in `.env.example` |
| Research Agent | `/api/research-agent`, `/api/research-agent/session`, UI `/research-agent` |
| Cookie path | `Path=/api/research-agent` covers the API and `/session`. It does **not** cover `/research-agent` or collection APIs |
| Platform auth | Sites ChatGPT headers for `/research` only |

Sites publishes the Worker. This repository does not contain a `wrangler deploy` script and must not grow one without authorization.

## Isolated preview configuration

Preview is a **gated** deployment mode, not a second application.

```text
NEUROLENS_DEMO_DEPLOYMENT=preview
NEUROLENS_DEMO_D1_ISOLATED=1
NEUROLENS_AGENT_PROVIDER=mock
```

`preview` requires the same password/session/rate secrets as `public`, refuses openai/`ALLOW_LIVE`, and fails closed unless `NEUROLENS_DEMO_D1_ISOLATED=1`. That flag is an operator acknowledgement, not proof that a separate D1 exists.

### Why a separate preview D1 is required

The Research Agent reuses `upload_limits` with `demo:` prefixes. The same Worker also stores collection tickets and `research_sessions` in `DB`.

If a preview Worker is bound to the production D1:

- the researcher dashboard on that Worker can see production sessions
- a bug in demo SQL could touch collection rows
- preview and production would share one blast radius

**Do not create that preview D1 from this slice.** Creating Cloudflare resources requires explicit user approval.

Local development continues to use Miniflare + `drizzle/0000_cool_groot.sql` and must not be pointed at production.

## Cookie path review

`Path=/api/research-agent` is correct and is not broadened.

| Request | Cookie sent? |
|---|---|
| `POST /api/research-agent` | yes |
| `GET/POST/DELETE /api/research-agent/session` | yes |
| `GET /research-agent` | no (UI uses `credentials: 'include'` to the API, not the page) |
| `/api/upload-ticket`, `/research` | no |

## D1 concurrency

The previous increment-then-read pair could theoretically observe a stale count if the follow-up `SELECT` raced. The smallest D1-safe fix is one UPSERT with `RETURNING count, expires`. SQLite serializes the `count = count + 1` write. Cleanup is now limited to `demo:sess:%` and `demo:rl:%` so expired demo rows cannot delete collection upload buckets.

In-process serialized-store tests confirm counting in one isolate. They do **not** prove remote D1 atomicity.

## Rollback

1. Do not deploy until the readiness report is all PASS and a human approves.
2. If a preview is later published through Sites, unpublish or restore the previous Sites deployment; do not merge this branch to `main`.
3. Local rollback is `git checkout` of `develop/neurolens-agent`.
