# Future real-LLM enablement (not this phase)

Status: **Review only. OpenAI is not implemented for hosting in this slice and must stay disabled.** Owner: Linxi. Depends on the W2.3–W2.7 provider/auth stack. Caijia scientific review remains Pending / Blocked.

The current design can accept a later paid provider **without redesigning** authentication, fixture allowlists, rate limits, or log shape. It cannot be turned on by a UI change.

## What already exists

| Control | Present? | Notes |
|---|---|---|
| Server-only API key | Yes | `OPENAI_API_KEY` is read in `loadAgentProviderConfig`; client `api_key` / `provider` fields are rejected |
| Provider selection | Yes | Env `NEUROLENS_AGENT_PROVIDER=mock\|openai` |
| Auth before provider | Yes | `enforceDemoAccess` runs before `createDemoRuntime` / `complete()` |
| Rate limit before provider | Yes | 429 returns before `ask()` |
| Request caps (eval) | Yes | `NEUROLENS_AGENT_MAX_REQUESTS` / cases for `eval:llm` |
| HTTP timeout | Yes | `AbortController` in the OpenAI adapter |
| Error containment | Yes | Unvalidated or failed completions become 503 / abstention; no raw model body to the client |
| Structured logs | Yes | Outcome + provider_mode; no key, question, or completion text |
| Cost measurement | Estimate only | Missing usage is NOT_MEASURED, not $0. A request cap is not a money ceiling |

## Preview / public gates that block live calls today

`NEUROLENS_DEMO_DEPLOYMENT=preview` or `public` fails closed if:

- provider is not `mock`, or
- `NEUROLENS_AGENT_ALLOW_LIVE` is set

That is intentional. A future paid preview needs a **new deployment decision**, not a weakening of these gates.

## Remaining requirements before any paid host

1. Explicit human approval (separate from Sites mock preview).
2. A non-public or tightly gated Site; shared-secret demo is not per-user billing isolation.
3. Hosted secrets: `OPENAI_API_KEY`, model, timeout, max tokens — never in Git.
4. `ALLOW_LIVE` only on that approved host, never on the mock preview.
5. Spend monitoring outside this repo (OpenAI dashboard / budget alerts). In-process `MAX_COST_USD` cannot preempt an in-flight call.
6. Keep eval live runs on `--live --execute` with a local `--out`; they are not part of `npm test`.
7. Caijia review still blocked; no clinical or live-quality claims.

**Do not set these values now.**
