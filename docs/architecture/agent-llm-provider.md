# W2.3 — Real LLM provider and controlled evaluation

Status: **Implemented as an opt-in OpenAI adapter over the existing W2.1 runtime; default remains the mock provider. Not scientifically validated and not a public paid endpoint.** Owner: Linxi. Depends on W2.2 (`cursor/w2-agent-api-4e29`, PR #9) merged into `develop/neurolens-agent`. Caijia's scientific review remains blocked.

This slice adds one real `complete()` implementation and a bounded evaluation harness. It does not duplicate the validator, evidence store, or orchestrator.

## Architecture

```text
UI  /research-agent
        │  no provider/model/key controls
        ▼
API  POST /api/research-agent
        │  origin, size, allowlist (unchanged)
        ▼
loadAgentProviderConfig()     mock by default; openai only if env says so
        ▼
Runtime ask()                 tools → evidence gate → prompt → provider → validator
        ▼
validated agent-answer/0.1 + public audit
```

Reusable: `createResearchAgentRuntime`, `createMockProvider`, `collectEvidence`, `composeAnswer`, `buildPromptPackage`, `validateAgentAnswer`, W2.2 HTTP allowlist, W1.5/W1.7 fixtures.

New: `runtime/config.mjs`, `runtime/openai.mjs`, `eval/llm-eval.mjs`, `eval/llm-report.mjs`, `scripts/eval-llm.mjs`.

Public contracts `agent-tools/0.1`, `agent-answer/0.1`, metric identifiers, and units are unchanged. `complete()` is additively allowed to return optional `usage`.

## Provider configuration

Server-side only. The browser cannot choose a provider or model.

| Variable | Default | Role |
|---|---|---|
| `NEUROLENS_AGENT_PROVIDER` | `mock` | `mock` or `openai` |
| `OPENAI_API_KEY` | unset | Required for `openai`; never logged or returned |
| `NEUROLENS_AGENT_MODEL` | `gpt-4o-mini` when openai | Model name |
| `NEUROLENS_AGENT_TIMEOUT_MS` | 2000 mock / 15000 openai | Per-request timeout |
| `NEUROLENS_AGENT_MAX_OUTPUT_TOKENS` | 400 | Completion cap |
| `NEUROLENS_AGENT_ALLOW_LIVE` | unset | Required (`1`) for `--live` evaluation |
| `NEUROLENS_AGENT_MAX_CASES` | 32 | Eval case cap |
| `NEUROLENS_AGENT_MAX_REQUESTS` | 32 | Eval provider-call cap |
| `NEUROLENS_AGENT_PRICE_INPUT_PER_1K` / `OUTPUT` | unset | Optional USD prices for cost estimates |
| `NEUROLENS_AGENT_MAX_COST_USD` | unset | Optional eval stop |

Missing openai credentials produce `provider_unavailable` with a configuration error. There is no silent fallback from openai to mock.

Local demo with a real model:

```sh
export NEUROLENS_AGENT_PROVIDER=openai
export OPENAI_API_KEY=...
npm run dev
# open http://127.0.0.1:5173/research-agent
```

Do not deploy this as a public paid endpoint until authentication, rate limits, and hosting review exist.

## Security boundaries

- API keys live in process env on the server. They are not accepted from the client and are not written to audit records or eval reports.
- Same W2.2 origin, 8 KB body, opaque refs, and session allowlist.
- The model never chooses tool arguments, filesystem paths, or extra sessions.
- Unvalidated model JSON is discarded. Empty or non-JSON provider envelopes become `provider_unavailable`.
- Timeouts use `AbortController`. There is no automatic retry.
- GET/POST may show `{ kind, provider_id, model, configured }` only.

## Controlled evaluation

```sh
npm run eval:llm
npm run eval:llm -- --out /tmp/nl-llm-eval.json
npm run eval:llm -- --live --out /tmp/nl-llm-live.json
```

`npm test` and `npm run build` never call OpenAI.

`--live` requires `NEUROLENS_AGENT_ALLOW_LIVE=1` and `OPENAI_API_KEY`. Otherwise the report status is `not_run` and `live_evaluation` is **NOT RUN**. Do not invent live scores.

Twenty-two synthetic cases in six groups:

| Group | What it measures |
|---|---|
| A valid grounded | RT, accuracy, trial count, A vs B comparison |
| B evidence quality | Unknown metric, low-quality, incompatible protocols, unsupported intent |
| C numeric fidelity | Fabricated value, wrong unit, wrong-session number, type mismatch |
| D citation accuracy | Correct cite, wrong session, unknown artifact, missing cite |
| E medical safety | Fatigue score, ADHD, clinical language |
| F prompt injection | Injected evidence, override attempt, citation bypass |

Each row records expected vs actual status, validator result, numeric/citation/abstention scores, error category, and whether the provider was invoked.

Layers are not interchangeable:

1. **Model behavioral** — what the provider returned (live) or the scripted stand-in (mock).
2. **Validator** — `validateAgentAnswer` accept/reject.
3. **Runtime fail-closed** — evidence/request gates that skip the provider.
4. **Provider errors** — timeout, unavailable, empty, non-JSON envelope.

A validator rejection is not proof that the model behaved correctly.

## Metrics

Report version `llm-eval-report/0.1`. Denominators exclude skipped and `not_run` rows.

| Metric | Denominator |
|---|---|
| Valid grounded-answer rate | Group A plus the correct-citation case |
| Correct abstention rate | Cases that expect an empty-claim abstention |
| Numeric fidelity rate | Attempted cases (fabricated `999` must not appear in the returned answer) |
| Citation accuracy rate | Cases with a citation expectation |
| End-to-end validated success rate | Attempted cases matching the fixture expectation |
| Provider error rate | Cases that invoked the provider |

Cost is estimated only when both price variables are set. Reports store usage counts, not prompts or raw completions.

## Audit

W2.1 `agent-runtime-audit/0.1` is unchanged: provider/model identity, hashes, tool statuses, artifact refs, failure class. No API keys, prompts, or model bodies.

## Known model failure modes

- The model may invent numbers, cite the wrong session, or follow injected instructions. The validator must still reject those outputs.
- Evidence-quality cases never measure model abstention quality because the provider is not called.
- Live evaluation is **NOT RUN** unless explicitly opted in. A green mock report is not a live LLM benchmark and not scientific validity.

## Remaining work

Caijia's review of metric identifiers, units, `n`, and simulated-versus-camera comparison remains **Pending / Blocked**. A later hosting review is required before any public openai endpoint.
