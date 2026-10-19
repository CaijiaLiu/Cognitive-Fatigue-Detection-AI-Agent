# Public Research Agent demo procedure

This is an operations note for a **mock-only**, authenticated demonstration. It does not authorize a paid OpenAI endpoint, participant recruitment, or a merge to `main`.

## Required public environment

Set these on the hosting platform. Do not commit values.

```text
NEUROLENS_DEMO_DEPLOYMENT=public
NEUROLENS_DEMO_PASSWORD=<at least 16 characters, not a known weak value>
NEUROLENS_DEMO_SESSION_SECRET=<at least 32 characters>
NEUROLENS_DEMO_RATE_SECRET=<at least 16 characters, or reuse RATE_HASH_KEY>
NEUROLENS_DEMO_RATE_WINDOW_MS=60000
NEUROLENS_DEMO_RATE_LIMIT=30
NEUROLENS_DEMO_LOGIN_RATE_LIMIT=10
NEUROLENS_DEMO_SESSION_TTL_S=28800
NEUROLENS_DEMO_TRUST_CF_IP=1
NEUROLENS_AGENT_PROVIDER=mock
```

Do **not** set `NEUROLENS_AGENT_ALLOW_LIVE` or `NEUROLENS_AGENT_PROVIDER=openai` on a public demo. The process fails closed with HTTP 503 if those are present or if required secrets/D1 are missing.

D1 must already exist (`DB`). Demo sessions and rate-limit buckets reuse `upload_limits` with `demo:sess:` and `demo:rl:` key prefixes. No schema migration is required. A **preview** Worker must not bind the production collection D1; see [cloudflare-preview.md](../architecture/cloudflare-preview.md).

## Local development

Default `NEUROLENS_DEMO_DEPLOYMENT` is `local`. Existing offline tests and `npm run dev` keep the Research Agent callable without a password. To exercise the login UI locally:

```text
NEUROLENS_DEMO_DEPLOYMENT=local
NEUROLENS_DEMO_PASSWORD=<dev-only password>
NEUROLENS_DEMO_SESSION_SECRET=<dev-only secret>
```

Local values belong in `.dev.vars`, not Git. Local memory stores are not production-grade abuse protection.

## Cloudflare / Sites compatibility

- Request handlers use `Request`/`Response`, Web Crypto, and optional `env.DB`.
- They do not use `node:crypto`, `Buffer`, or filesystem session stores.
- `cf-connecting-ip` is trusted only when `NEUROLENS_DEMO_TRUST_CF_IP=1`.
- Sites ChatGPT headers remain the researcher-dashboard control. They are not the demo password.

## Enablement checklist

1. Confirm the branch is on `develop/neurolens-agent` (or a reviewed PR targeting it). Do not merge to `main` from this note.
2. Confirm provider is mock and `ALLOW_LIVE` is unset.
3. Set public secrets on the hosting platform.
4. Confirm D1 is bound as `DB`.
5. Open `/research-agent`, sign in, ask a fixture question, sign out.
6. Confirm unauthenticated `curl` to `POST /api/research-agent` returns 401.
7. Confirm logs contain request ids and outcomes, not passwords or questions.

**PUBLIC DEPLOYMENT: NOT VERIFIED** until a human with hosting credentials performs the checklist and records the preview URL.

## Future OpenAI enablement (out of scope here)

A later paid preview still uses this authentication, allowlist, rate-limit, and logging stack. It additionally requires:

- explicit deployment approval
- `NEUROLENS_AGENT_PROVIDER=openai`
- `NEUROLENS_AGENT_ALLOW_LIVE=1`
- a non-Git `OPENAI_API_KEY`
- request/token/timeout caps and monitoring
- a decision that the host is not a public unpaid demo

Do not turn those on by changing only the UI.
