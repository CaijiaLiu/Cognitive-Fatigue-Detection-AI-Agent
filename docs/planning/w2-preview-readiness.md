# W2.8 deployment readiness

Generated 2026-10-19 for `feature/w2-cloudflare-preview`. This is not permission to deploy.

| Requirement | Status | Evidence |
|---|---|---|
| Git SHA | NOT_VERIFIED | Fill at authorized deploy time from `git rev-parse HEAD` |
| Target environment | BLOCKED | Must be an isolated Sites preview with `NEUROLENS_DEMO_DEPLOYMENT=preview` |
| Worker name | NOT_VERIFIED | Sites generates `dist/server/wrangler.json`; no checked-in name |
| D1 binding names | PASS | Binding `DB` in `.openai/hosting.json` |
| D1 database identity | BLOCKED | No isolated preview D1 exists in-repo; production identity is not recorded here |
| Required secret names | PASS | `NEUROLENS_DEMO_PASSWORD`, `NEUROLENS_DEMO_SESSION_SECRET`, `NEUROLENS_DEMO_RATE_SECRET` (values not in Git) |
| Required migrations | PASS | No new tables. Local only: `drizzle/0000_cool_groot.sql` |
| Mock-only enforcement | PASS | Preview/public refuse openai/`ALLOW_LIVE` |
| Authentication enforcement | PASS | Preview/public require server-side session cookie |
| Rate-limit configuration | PASS | Shared D1 UPSERT + RETURNING; in-memory is test/local only |
| Known security risks | PASS (documented) | Shared-secret identity; stolen cookie until TTL/logout; remote D1 races not proven |
| Rollback plan | PASS | Do not deploy; otherwise unpublish Sites preview / restore previous deployment |
| Exact deployment commands | BLOCKED | Sites publish is the host path. No `wrangler deploy` is authorized |
| Cloud authorization | BLOCKED | User has not approved creating D1, setting secrets, or exposing a URL |

Critical FAIL/BLOCKED rows are present. **Do not deploy.**

```text
CLOUDFLARE PREVIEW: NOT DEPLOYED
REMOTE E2E: NOT RUN
```

## Commands that would be used after approval (not run)

```sh
# 1. Human creates an isolated preview D1 and binds it as DB on a non-production Site.
# 2. Human sets preview secrets in Sites. Do not reuse production session secrets.
# 3. Human publishes the Site from this branch through Sites, not wrangler deploy.
# 4. Record the preview URL.
# 5. NEUROLENS_DEMO_PASSWORD=… npm run verify:preview-http -- --base https://AUTHORIZED_HOST
# 6. Walk docs/operations/preview-verification.md in a browser.
# 7. Inspect Workers logs for research_agent lines only.
```

`npm run preview:readiness` reprints this classification from the current process environment without secret values.
