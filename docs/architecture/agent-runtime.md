# W2.1 — Research Agent runtime and orchestration

Status: **Implemented as a mock-provider runtime over the existing evidence pipeline; not a hosted LLM service and not scientifically validated.** Owner: Linxi. Depends on W1.7 (`cursor/w1-reliability-4e29`, PR #7). Collection, consent, D1, deployment, and Caijia's pending metric review are unchanged.

This is the smallest production-oriented orchestrator that connects already-implemented W1 components. It does not duplicate the adapter, tools, prompt builder, or validator.

## Architecture

```text
ask({ question, intent, session_scope })
        │
        ▼
  authorize request          opaque refs only; intent ⊆ session_scope
        │
        ▼
  collectEvidence()          existing read-only tools; runtime chooses arguments
        │
        ▼
  composeAnswer() gate       skip provider on evidence / unsupported intents
        │
        ▼
  buildPromptPackage()       research-agent-prompt/0.1; evidence stays in its section
        │
        ▼
  provider.complete()        mock today; pluggable later
        │
        ▼
  parseModelResponse()
        │
        ▼
  validateAgentAnswer()      original artifacts + session scope
        │
        ▼
  validated agent-answer/0.1 + agent-runtime-audit/0.1
```

Reused, not rewritten: V1 export adapter (via `createAnalysisTools({ store })`), immutable evidence store, read-only tools, prompt builder, `parseModelResponse`, `validateAgentAnswer`, eval/reliability fixtures.

The provider never selects tool names, filesystem paths, or extra sessions. Failed or unparseable model output is discarded and replaced with a contract-compliant abstention.

## What is and is not established

| Kind | Meaning here |
|---|---|
| Mock provider correctness | Scripted / timeout / unavailable modes behave deterministically and do not use keys or network. |
| Runtime integration correctness | A question can travel tools → prompt → provider → validator; unvalidated claims never leave the runtime. |
| Real LLM behavior | Not measured. No live provider is included. |
| Scientific validity | Not established. Metric definitions remain pending Caijia review. |

## Provider interface

```js
provider.complete({ system, user, timeout_ms }) → Promise<{ text, latency_ms, provider_id, model }>
```

`createMockProvider({ provider_id, model, mode, response, latency_ms })` is the only implementation in this slice.

| `mode` | Result |
|---|---|
| `scripted` (default) | Returns the configured JSON/text |
| `timeout` | Throws `ProviderError` / `provider_timeout` |
| `unavailable` | Throws `ProviderError` / `provider_unavailable` |

A later HTTP provider must implement the same `complete()` method, read credentials from the environment (never from Git), honor `timeout_ms`, and must not validate evidence itself.

## Execution lifecycle

1. Accept `question`, structured `intent`, and explicit `session_scope`.
2. Reject extra fields, paths/URLs/SQL, malformed refs, and scope expansion.
3. Resolve authorized evidence with existing tools.
4. If evidence is missing, unusable, incompatible, or the intent is unsupported, abstain **without** calling the provider.
5. Otherwise build the existing prompt package and call the provider.
6. Parse and validate the reply against the original artifacts and session scope.
7. Return the validated answer or a safe abstention. Never return the raw model object after a validator failure.

## Failure handling

Internal `failure_class` values are `request`, `evidence`, `provider`, `validation`, or `none`. They are not interchangeable with `insufficient_data`.

| Condition | Class | `reason_code` |
|---|---|---|
| Timeout | provider | `provider_timeout` |
| Provider down / missing script | provider | `provider_unavailable` |
| Malformed JSON | validation | `malformed_output` |
| Fabricated number / wrong unit | validation | `numeric_mismatch` |
| Foreign or unreturned citation | validation | `missing_evidence` or `session_mismatch` |
| ADHD / diagnostic request | request | `unsupported_claim` |
| Low-quality / missing metric | evidence | `insufficient_data` / `missing_evidence` |
| Incompatible protocols | evidence | `incompatible_protocol` |
| Unknown artifact | evidence | `unknown_artifact` |
| Scope expansion, path, extra fields | request | `rejected_request` |

## Audit schema (`agent-runtime-audit/0.1`)

Stored: request id, provider/model identity, prompt/contract/analysis versions, question SHA-256 and length, session scope, tool call statuses, artifact refs, validation result, failure class/reason, whether the provider was invoked, timeout, duration.

Not stored: raw camera data, participant identifiers, full prompts, or model response bodies. Audit records carry an explicit non-medical limitation.

## Local testing

```sh
npm run test:runtime
npm test
```

No API key and no network. `test:runtime` is mock-provider correctness plus orchestration fail-closed tests.

## Known limitations

- There is no real LLM provider or retry policy. W2.2 adds a synthetic same-origin HTTP demo (`POST /api/research-agent`); see [agent-api.md](agent-api.md).
- Evidence-quality failures skip the model; that is fail-closed engineering, not a measure of model abstention quality.
- Valid provider abstentions are accepted by the existing answer contract without re-checking the reason narrative.
- Timeout is deterministic in the mock (immediate `ProviderError`); it does not sleep.
- Caijia's metric/unit/`n`/simulated-versus-camera review remains blocked.
