# Preview verification plans

Use these checks only against an authorized isolated preview or the offline in-process harness. Synthetic fixtures only. No OpenAI calls.

## HTTP security (executable)

Offline (no network):

```sh
npm run verify:preview-http
```

The script reads `NEUROLENS_DEMO_PASSWORD` when set. It never prints cookies, passwords, or full authenticated headers.

Remote plan — **do not run** until a human authorizes a preview URL:

```sh
# After approval only:
# NEUROLENS_DEMO_PASSWORD='…' node scripts/verify-preview-http.mjs --base https://AUTHORIZED_PREVIEW_HOST
```

The script currently refuses `--base` and exits 2 so an accidental remote run cannot happen from this slice.

| # | Check | Expected |
|---|---|---|
| 1 | Unauthenticated POST `/api/research-agent` | 401 |
| 2 | Wrong password | 401 `Authentication failed.` |
| 3 | Correct login | 200 + HttpOnly / SameSite=Lax / Path=/api/research-agent |
| 4 | Authenticated fixture ask | 200 |
| 5 | Unknown session ref | 403 |
| 6 | Hidden fixture session | 403 |
| 7 | Client-supplied evidence | 400 |
| 8 | Client-selected provider | 400 |
| 9 | Oversized body | 413 |
| 10 | Rate-limit exhaustion | 429 |
| 11 | Logout | 200 |
| 12 | Replayed logged-out cookie | 401 |
| 13 | Invalid Origin | 403 |
| 14 | Missing preview secrets | config fail-closed |
| 15 | Real provider / misconfig | 503 |

## Browser E2E plan (manual; no Playwright added)

Previous collection work found Playwright's browser download unavailable in this environment. Do not add a large browser dependency for this slice. Use the existing controlled-DOM flow tests plus this checklist on an authorized preview:

1. Open `/research-agent` signed out → login form, synthetic disclaimer, no metric values.
2. Sign in with the preview password (not pasted into a ticket).
3. Refresh → still signed in.
4. Choose fixture A and median reaction time → validated answer + `fixture:session-summary:a`.
5. Choose low-quality fixture → abstention, empty claims.
6. Sign out → form hidden; replayed API call 401.
7. Narrow viewport (~390px) → login and ask forms remain usable.
8. DevTools console → no uncaught errors; no password or cookie in application `localStorage`.

401/403/429 copy is covered by `viewFromHttp` unit tests. Expired-session behavior is covered by offline clock tests.

## Observability

Structured `research_agent` logs include request id, endpoint, outcome, authenticated, rate_limited, provider_mode, latency_ms, error_category.

Inspect hosted logs in the Sites/Workers dashboard. Filter on `"event":"research_agent"`. Do not download or paste raw logs that might have been mixed with platform request headers.

Local inspection:

```sh
# After npm run dev, stdout JSON lines only. Do not commit log files.
```

Redaction tests: `tests/agent-preview-deploy.test.mjs`.
