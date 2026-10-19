# W2.7 — Authenticated Research Agent demo

Status: **Implemented as a mock-only, fail-closed public-demo boundary over the existing vinext/Workers stack. Not a real-LLM service, not scientifically validated, and not a public deployment report.** Owner: Linxi. Depends on W2.6A (`feature/w2-live-llm-baseline`, merged to `develop/neurolens-agent`). Collection consent, D1 research tables, metric identifiers, and Caijia's pending scientific review are unchanged.

## Phase 1 inspection (before implementation)

| Layer | What exists | Decision |
|---|---|---|
| Runtime | vinext (Vite + RSC) compiled to Cloudflare Workers | Stay on Workers APIs (`Request`, Web Crypto, D1). Do not add Node-only modules to the request path. |
| Hosting | OpenAI Sites / Cloudflare Workers + existing D1 `DB` | Reuse D1. No new database, KV, or identity vendor. |
| Platform auth | Sites `oai-authenticated-user-*` headers and `/signin-with-chatgpt` | Used by the private researcher dashboard. Not used as the demo gate: public Sites allow anonymous visitors, local preview only simulates `seedy@sites.test`, and locking the whole Site would also lock collection. |
| Research Agent API | `POST /api/research-agent` with `sameOrigin` + fixture allowlist | `sameOrigin` is CSRF/origin control, not authentication. Keep it and add a server-side session. |
| Rate limiting | D1 `upload_limits` + `RATE_HASH_KEY` + `cf-connecting-ip` on upload tickets | Reuse the same table with `demo:` key prefixes. An in-memory limiter is test-only. |
| Provider | Mock default; OpenAI only with `ALLOW_LIVE` | Public demo must be mock-only and fail closed if openai/live is configured. |

Alternatives rejected: OAuth/user database (unnecessary for a shared demo password); Cloudflare Access or a new IdP (new service); Sites-private-site as the only control (blocks collection and is unavailable locally); in-memory limiter as production (not safe across Worker isolates).

## Authentication

The smallest Workers-safe gate is a **shared demo password** exchanged for an **HMAC-signed HttpOnly cookie**.

1. Visitor POSTs `{ "password" }` to `/api/research-agent/session` (same-origin JSON only).
2. Server compares the password with `NEUROLENS_DEMO_PASSWORD` using SHA-256 then a constant-time compare.
3. Server issues a random `sid`, stores `SHA-256(sid)` in the session store, and sets `nl_demo`.
4. Protected GET/POST `/api/research-agent` require a valid cookie **and** a live store record.
5. Logout deletes the store row and clears the cookie. A replayed cookie then fails.

Cookie flags: `HttpOnly`, `SameSite=Lax`, `Path=/api/research-agent`, `Secure` on public/HTTPS. Credentials never appear in URLs or `localStorage`. Failed login, missing cookie, invalid cookie, and expired cookie all return a generic client error.

Local development (`NEUROLENS_DEMO_DEPLOYMENT=local`, default) does not require a password unless one is configured, so existing offline API tests stay unauthenticated. Public deployment cannot fall back to that mode.

## Authorization

Authentication is not fixture authorization. After the cookie is accepted, `validateAgentHttpBody` still:

- rejects unknown or hidden `session_ref` values
- rejects client-supplied evidence, tools, paths, and URLs
- rejects client-selected providers and API keys
- keeps the server allowlist independent of the UI

Session-enumeration details (why a cookie failed, whether a fixture id exists) are not returned to the client.

## Rate limiting

| Mode | Store | Notes |
|---|---|---|
| Unit tests | Memory increment map | Deterministic; allowed only when tests set `allowMemoryLimiter` |
| Local preview without D1 | Memory | Documented as not production-grade |
| Public demo | Shared D1 `upload_limits` | Required. Missing D1 fails closed with 503 |

Limits are per demo session (`sid`) in a configurable window. When `NEUROLENS_DEMO_TRUST_CF_IP=1`, a second cap uses Cloudflare's `cf-connecting-ip`. `X-Forwarded-For` and untrusted IP headers are ignored. Rejection is HTTP 429 and happens before the provider `complete()` call.

## Deployment profiles

| Profile | Provider | Auth | Rate limit | Fail closed when |
|---|---|---|---|---|
| Local | mock | optional | optional | Invalid integers only |
| Public demo | mock only | required | shared store required | Missing password/session/rate secrets, openai/`ALLOW_LIVE`, or no shared store |
| Future real LLM | openai + `ALLOW_LIVE` | same auth/limit/log stack | same | Not enabled in this phase; needs separate approval, spend controls, and monitoring |

## Observability

Structured `research_agent` logs record request id, timestamp, endpoint, outcome, authenticated flag, rate-limit result, provider mode, latency, and error category. They do not record passwords, cookies, API keys, full questions, raw model text, or fixture evidence.

## UI

`/research-agent` shows a synthetic-data disclaimer, login/logout, loading, and friendly 401/403/429 copy. It does not present fatigue scores, ADHD probabilities, or live-model performance.

## Limits

- Shared-secret demo access is not per-user identity and is not Sites ChatGPT SSO.
- D1 increment-then-read can slightly overshoot the cap under isolate races; it still bounds abuse.
- Cookie theft before logout remains valid until TTL unless the store row is deleted.
- PUBLIC DEPLOYMENT is a separate hosting step and is not verified by this slice.
