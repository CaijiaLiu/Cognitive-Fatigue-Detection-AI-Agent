# Implementation status

## W2.7 Authenticated demo and deployment hardening (2026-10-19)

**Status:** Implemented as a mock-only, fail-closed demo boundary. Not a real-LLM endpoint, not scientifically validated, not publicly deployed. Caijia scientific review remains **Pending / Blocked**.

Implementation branch: `feature/w2-authenticated-demo` @ `9d19155`, based on `develop/neurolens-agent` after PR #12 fast-forward (`22be750`). Design: [agent-demo-security.md](../architecture/agent-demo-security.md). Operations: [public-demo.md](../operations/public-demo.md). Tests: `tests/agent-demo-security.test.mjs`.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| PR #12 consolidation | Merged | Fast-forward into develop @ `22be750`. Main unchanged @ `c163f29`. |
| Demo authentication | Implemented | Shared-secret password → HMAC HttpOnly `nl_demo` cookie; server-side session store |
| Authorization | Implemented | Cookie required in public mode; fixture allowlist unchanged; client evidence still rejected |
| Rate limiting | Implemented | Per-session D1/`upload_limits` buckets; optional trusted `cf-connecting-ip`; memory store is test/local only |
| Public config fail-closed | Implemented | Missing secrets, openai/`ALLOW_LIVE`, or missing shared store → 503 |
| Privacy-safe logs | Implemented | Request id, outcome, auth/rate-limit flags, provider mode, latency; no secrets/questions/outputs |
| Demo UX | Implemented | Login/logout, synthetic disclaimer, 401/403/429 copy on `/research-agent` only |
| Offline security tests | Implemented | 15 deterministic cases; no OpenAI calls |
| Public deployment | NOT VERIFIED | No hosting credentials used; do not treat this as a live Sites deploy |
| Scientific metric review | Blocked | Pending Caijia review; identifiers/units/clinical assumptions unchanged |

**Not changed:** prompts, validator, fixture metrics, collection/camera, researcher ChatGPT auth, or Caijia review assignments. No OAuth, user database, or new hosting service.

**Checks actually run (2026-10-19, W2.7):**
- `npm test` — 135 passed, 0 failed.
- `npm run test:runtime` — 14 passed.
- `npm run test:agent-api` — 10 passed.
- `npm run test:llm` — 23 passed.
- `npm run test:demo-security` — 15 passed.
- `npm run test:integration` — 6 passed.
- `npm run test:reliability` — 7 passed.
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run.
- No live OpenAI call was made and no production API key was read.
- **PUBLIC DEPLOYMENT: NOT VERIFIED**

**Next task:** human-authorized mock preview on Sites, then a separately approved W2.8 real-LLM enablement review. Do not merge to `main`. Keep Caijia review blocked.

## W2.6A Real LLM baseline experiment (2026-10-19)

**Status:** Baseline scoring integrity verified. Dry-run manifest recorded. Live paid baseline is **NOT RUN**. Not scientifically validated. Caijia scientific review remains **Pending / Blocked**.

Implementation branch: `feature/w2-live-llm-baseline` @ `a7ccb9a` / `22be750` (PR #12, fast-forwarded into `develop/neurolens-agent`). Design: [agent-llm-baseline.md](../architecture/agent-llm-baseline.md). Manifest: [w2-live-baseline-manifest.json](w2-live-baseline-manifest.json).

| Capability | Status | Evidence / remaining work |
|---|---|---|
| PR #11 consolidation | Merged | Fast-forward into develop @ `eaf44d9`; PR #12 later fast-forwarded @ `22be750` |
| Model vs runtime denominators | Tightened | Runtime skips excluded; D ≠ model abstention; abstention ≠ numeric/citation success |
| Evidence-based numeric/citation | Implemented | Compare answered claims to `composeAnswer` gold artifacts |
| Dry-run manifest | Implemented | 12 cases, 6 expected invocations, no secrets |
| Live baseline | NOT RUN | No key, no ALLOW_LIVE, no `--execute` spend authorization |
| Scientific metric review | Blocked | Pending Caijia review; identifiers/units unchanged |

**Not changed:** prompts, validator, production runtime contract, collection/camera/D1, or Caijia review assignments.

**Checks actually run (2026-10-19, W2.6A):**
- `npm test` — 120 passed, 0 failed.
- `npm run test:runtime` — 14 passed.
- `npm run test:agent-api` — 10 passed.
- `npm run test:llm` — 23 passed.
- `npm run test:integration` — 6 passed.
- `npm run test:reliability` — 7 passed.
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run eval:llm -- --plan live-12 --live` — dry-run only; live **NOT RUN**.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run.
- No live OpenAI call was made and no production API key was read.

**Next task:** authorized `--live --execute` with a local `--out` and an explicit cost cap. Do not merge to `main`.

## W2.5 Real LLM evaluation and failure analysis (2026-10-19)

**Status:** Implemented as an analysis layer over the existing W2.3/W2.4 eval engine. Live paid evaluation is **NOT RUN**. Not scientifically validated. Caijia scientific review remains **Pending / Blocked**.

Implementation branch: `feature/w2-llm-evaluation` @ `5bb05e6` (Draft PR #11), based on `develop/neurolens-agent` after PR #10 fast-forward (`24d5585`). Source: `analysis/src/neurolens/eval/llm-analysis.mjs`, `scripts/eval-llm.mjs`. Tests: `tests/agent-llm-analysis.test.mjs`. Design: [agent-llm-evaluation.md](../architecture/agent-llm-evaluation.md).

| Capability | Status | Evidence / remaining work |
|---|---|---|
| 12-case live plan | Implemented | `listLivePlanCases()`; mock run 12/12 attempted |
| Model vs runtime metrics | Implemented | Provider-invoked rows only in model rates; runtime skips excluded |
| Experiment fingerprints | Implemented | Prompt, fixture, and case SHA-256 prefixes; git SHA |
| Failure taxonomy | Implemented | Outcome classes A–F and 14 categories |
| JSON + Markdown reports | Implemented | `--out report.json` also writes `.md` |
| Dry-run live gate | Implemented | `--live` is dry-run; `--execute` required to spend |
| Live evaluation | NOT RUN | No credentials / `--execute` authorization in this environment |
| Scientific metric review | Blocked | Pending Caijia review; identifiers/units unchanged |

**Not changed:** production runtime contract, validator, evidence store, collection/camera/D1, or Caijia review assignments.

**Checks actually run (2026-10-19, W2.5):**
- `npm test` — 119 passed, 0 failed (previous 109 plus 10 analysis tests).
- `npm run test:runtime` — 14 passed.
- `npm run test:agent-api` — 10 passed.
- `npm run test:llm` — 22 passed.
- `npm run test:integration` — 6 passed.
- `npm run test:reliability` — 7 passed.
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run eval:llm -- --plan live-12` — mock 12/12; outcomes A=6 B=5 D=1; live **NOT RUN**.
- `npm run eval:llm -- --plan live-12 --live` — dry-run only; no provider calls.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run.
- No live OpenAI call was made and no production API key was read.

**Next task:** keep scientific review blocked. Run the 12-case live plan only with explicit `--execute` and a local `--out`. Do not merge to `main`.

## W2.4 Independent review, security hardening, and live-LLM readiness (2026-10-19)

**Status:** Engineering review of W2.3 PR #10 completed. Confirmed P0/P1 defects in scope are fixed. Live evaluation is **NOT RUN**. Not scientifically validated, not a public paid endpoint, not deployed. Caijia scientific review remains **Pending / Blocked**.

Implementation branch: `feature/w2-real-llm-provider` (W2.4 commits on top of W2.3 `c0e5603`). Review: [agent-llm-review.md](../architecture/agent-llm-review.md). Provider contract: [agent-llm-provider.md](../architecture/agent-llm-provider.md). Tests: `tests/agent-llm.test.mjs`.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Independent review of PR #10 | Implemented | Findings classified P0–P3 with file/line, impact, and fix |
| OpenAI Chat Completions contract | Implemented | `max_completion_tokens`, `response_format=json_object`; truncated/filtered/empty/schema failures mapped |
| Real-provider opt-in | Implemented | HTTP and eval require `NEUROLENS_AGENT_ALLOW_LIVE=1` |
| Offline provider-contract tests | Implemented | Valid JSON, invalid JSON, 401/429/500, network, timeout, empty, truncated, unexpected schema |
| Eval layer separation | Implemented | `PASS\|FAIL\|SKIPPED\|PROVIDER_ERROR\|NOT_RUN`; runtime-skip vs validator abstention; n/a omitted |
| Cost controls | Documented + tested | Estimate-only stop; missing usage ≠ $0; request cap ≠ monetary budget |
| Live evaluation | NOT RUN | 12-case plan recorded; no credentials in this environment |
| Public paid endpoint | Out of scope | `sameOrigin` is not authentication |
| Scientific metric review | Blocked | Pending Caijia review; identifiers/units unchanged |

**Not changed:** collection consent/camera/D1, metric identifiers, units, protocol compatibility, or Caijia review assignments. No second validator, provider abstraction, or evidence store.

**Checks actually run (2026-10-19, W2.4):**
- `npm test` — 109 passed, 0 failed (10 agent-api + 12 agent-eval + 12 agent-llm + 7 agent-reliability + 14 agent-runtime + 23 agent-tools + 16 analysis-adapter + 6 analysis-integration + 4 collection + 5 research).
- `npm run test:runtime` — 14 passed.
- `npm run test:agent-api` — 10 passed.
- `npm run test:llm` — 12 passed.
- `npm run test:integration` — 6 passed.
- `npm run test:reliability` — 7 passed.
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run eval:llm` — mock suite 22/22 e2e; live **NOT RUN**.
- `npm run build` — vinext/Vite production build completed; routes include `/api/research-agent` and `/research-agent`.
- `tests/integration.mjs` was not run.
- No live OpenAI call was made and no production API key was read.

**Next task:** keep scientific review blocked. Hosted openai requires authentication and rate limits. Do not merge this PR to `main`. Do not treat the mock eval report as live LLM quality.

## W2.3 Real LLM provider and controlled evaluation (2026-10-19)

**Status:** Implemented and verified with deterministic mock/config tests. OpenAI adapter is opt-in. Live evaluation is **NOT RUN**. Not scientifically validated, not a public paid endpoint, not deployed.

Implementation branch: `feature/w2-real-llm-provider` @ `55fdb63`, based on `develop/neurolens-agent` after PR #9 fast-forward (`1c3a995`). Source: `analysis/src/neurolens/runtime/{config,openai}.mjs`, `analysis/src/neurolens/eval/{llm-eval,llm-report}.mjs`. Tests: `tests/agent-llm.test.mjs`. Design: [agent-llm-provider.md](../architecture/agent-llm-provider.md).

The default provider remains `mock`. `NEUROLENS_AGENT_PROVIDER=openai` plus `OPENAI_API_KEY` selects `createOpenAIProvider`. The existing runtime still validates every completion. There is no silent fallback from openai to mock.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| OpenAI `complete()` adapter | Implemented | Official Chat Completions HTTP API; timeout / empty / non-JSON mapped |
| Server-side provider selection | Implemented | Env only; client `provider` / `api_key` rejected |
| Controlled mock evaluation | Implemented | 22 synthetic cases A–F; `llm-eval-report/0.1` |
| Live evaluation | NOT RUN | Requires `--live` and `NEUROLENS_AGENT_ALLOW_LIVE=1` |
| Cost estimate | Optional | Only when both price env vars are set |
| Public paid endpoint | Out of scope | Local/dev only until auth and rate limits exist |
| Scientific metric review | Blocked | Pending Caijia review; unchanged |

**Not changed:** collection consent/camera/D1, metric identifiers, units, protocol compatibility, or Caijia review items.

**Checks actually run (2026-10-19, W2.3):**
- `npm test` — 105 passed, 0 failed (10 agent-api + 12 agent-eval + 8 agent-llm + 7 agent-reliability + 14 agent-runtime + 23 agent-tools + 16 analysis-adapter + 6 analysis-integration + 4 collection + 5 research).
- `npm run test:runtime` — 14 passed.
- `npm run test:agent-api` — 10 passed.
- `npm run test:llm` — 8 passed.
- `npm run test:integration` — 6 passed.
- `npm run test:reliability` — 7 passed.
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run eval:llm` — mock suite 22/22 e2e; live **NOT RUN**.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run.
- No live OpenAI call was made and no production API key was read.

**Next task:** keep scientific review blocked. A later hosting review is required before any public openai endpoint. Do not merge this PR to `main`. Do not treat the mock eval report as live LLM quality.

## W2.2 Research Agent HTTP API and interactive demo (2026-10-19)

**Status:** Implemented and verified with in-process HTTP handler tests plus typecheck/build. Synthetic fixtures and mock provider only. Not a public LLM endpoint, not scientifically validated, not deployed.

Implementation branch: `cursor/w2-agent-api-4e29` @ `a19ec8e`, based on W2.1 `cursor/w2-runtime-4e29` @ `dce0a35` (PR #8). Source: `analysis/src/neurolens/runtime/{http,demo-ui}.mjs`, `app/api/research-agent/`, `app/research-agent/`. Tests: `tests/agent-api.test.mjs`. Design: [agent-api.md](../architecture/agent-api.md).

The vinext route is a thin wrapper around `handleResearchAgentPost`. Session authorization is enforced server-side. Client-provided evidence, tool results, and filesystem paths are rejected. Only validated `agent-answer/0.1` objects are returned.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| POST `/api/research-agent` | Implemented | W2.1 request fields; origin + 8 KB JSON + allowlist |
| GET catalog | Implemented | Synthetic sessions, questions, allowed metrics |
| Interactive demo UI | Implemented | `/research-agent` loading / success / abstention / error |
| Server-side session allowlist | Implemented | Hidden and export refs return 403 even if the UI is bypassed |
| No client evidence trust | Implemented | Extra `evidence` / `path` / `intent.type` rejected |
| No prompt / raw-provider leakage | Implemented | Public audit only; drifted `999` discarded |
| Mock provider only | Implemented | `createDemoRuntime` uses `createMockProvider` + `composeAnswer` |
| Real LLM provider | Out of scope | Same `complete()` boundary as W2.1 |
| Scientific metric review | Blocked | Pending Caijia review; unchanged |

**Not changed:** collection consent/camera/D1, metric identifiers, units, protocol compatibility, or Caijia review items. The collection page gained navigation links only.

**Checks actually run (2026-10-19, W2.2):**
- `npm test` — 97 passed, 0 failed (10 agent-api + 12 agent-eval + 7 agent-reliability + 14 agent-runtime + 23 agent-tools + 16 analysis-adapter + 6 analysis-integration + 4 collection + 5 research).
- `npm run test:agent-api` — 10 passed, 0 failed.
- `npm run test:runtime` — 14 passed, 0 failed.
- `npm run test:integration` — 6 passed, 0 failed.
- `npm run test:reliability` — 7 passed, 0 failed.
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run build` — vinext/Vite production build completed; routes include `/api/research-agent` and `/research-agent`.
- Live local preview (`npm run dev`, `http://127.0.0.1:5173`): `GET /research-agent` 200 with synthetic demo form; `GET /api/research-agent` catalog; same-origin `POST` for fixture A returns validated `320` ms and `fixture:session-summary:a`; hidden session `403`; missing `Origin` `403`; low-quality fixture abstains `insufficient_data`.
- Headless Chrome against the live page: submit session A → UI shows `Validated answer` / `320` ms / `fixture:session-summary:a`; submit low-quality → `The agent abstained` / `insufficient_data` and no leftover `320`. Both clicks issued `POST /api/research-agent`.
- `tests/integration.mjs` was not run (collection/cloud unchanged).
- No LLM API call was made and no API key was read.

**Next task:** keep scientific review blocked. A later isolated HTTP provider may implement `complete()`; do not treat this demo as a hosted research service. Do not merge this PR to `main`.

## W2.1 Research Agent runtime and orchestration (2026-10-19)

**Status:** Implemented and verified with a deterministic mock provider. Engineering runtime only. Not a hosted LLM, not scientifically validated, not deployed.

Implementation branch: `cursor/w2-runtime-4e29` @ `4973e57`, based on W1.7 `cursor/w1-reliability-4e29` @ `181f305` (PR #7). Source: `analysis/src/neurolens/runtime/`. Tests: `tests/agent-runtime.test.mjs`. Design: [agent-runtime.md](../architecture/agent-runtime.md).

The runtime reuses the existing export adapter, evidence store, read-only tools, prompt builder, and `validateAgentAnswer`. Provider output is never returned until it passes the validator. Unvalidated claims are replaced with a contract-compliant abstention.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Provider interface + mock | Implemented | `createMockProvider` scripted / timeout / unavailable; no keys or network |
| Orchestrated ask() | Implemented | question + intent + session_scope → tools → prompt → provider → validator |
| Fail-closed provider errors | Implemented | `provider_timeout` and `provider_unavailable` are distinct from `insufficient_data` |
| Fail-closed validation | Implemented | malformed JSON, fabricated values, foreign citations discarded |
| Evidence short-circuit | Implemented | missing / incompatible / unknown / unsupported intents skip the provider |
| Scope lock | Implemented | intent sessions must be ⊆ session_scope; paths/URLs rejected |
| Audit trail | Implemented | `agent-runtime-audit/0.1` without raw prompts or model bodies |
| Real LLM provider | Out of scope | Interface only; no paid API dependency |
| Scientific metric review | Blocked | Pending Caijia review; unchanged |

**Not changed:** collection, consent, production D1, camera, deployment, metric identifiers, units, protocol compatibility, or Caijia review items.

**Checks actually run (2026-10-19, W2.1):**
- `npm test` — 86 passed, 0 failed (11 agent-eval + 7 agent-reliability + 14 agent-runtime + 23 agent-tools + 16 analysis-adapter + 6 analysis-integration + 4 collection + 5 research).
- `npm run test:runtime` — 14 passed, 0 failed.
- `npm run test:integration` — 6 passed, 0 failed.
- `npm run test:reliability` — 7 passed, 0 failed.
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run (collection/cloud unchanged).
- No LLM API call was made and no API key was read.

**Next task:** keep scientific review blocked. A later isolated HTTP provider may implement `complete()`; do not treat mock-provider tests as real LLM behavior. Do not merge this PR to `main`.

## W1.7 Research Agent reliability and adversarial testing (2026-10-19)

**Status:** Implemented and verified in synthetic contract tests plus typecheck/build. Deterministic validator and prompt-boundary checks only. Not LLM robustness, not scientifically validated, not deployed.

Implementation branch: `cursor/w1-reliability-4e29` @ `4047a7a`, based on W1.6 `cursor/w1-integration-4e29` @ `a3e5072` (PR #6). Source: `analysis/src/neurolens/eval/{adversarial,reliability}.mjs`. Tests: `tests/agent-reliability.test.mjs`. Design / reliability report: [agent-reliability.md](../architecture/agent-reliability.md).

This slice does **not** call an LLM, change metric definitions, or close Caijia's scientific review. Existing `agent-tools/0.1` and `agent-answer/0.1` validators are reused; there is no second validation system.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Numeric integrity traps | Implemented | Fabricated value, wrong unit, unsupported metric, numeric string, missing field |
| Evidence provenance traps | Implemented | Cross-session cite, unknown ref, wrong metric on a valid artifact, empty/conflicting refs |
| Evidence quality traps | Implemented | Unusable session, incompatible protocols, missing artifact, missing export features, unsupported request |
| Prompt-section isolation | Implemented | Injected "Ignore the system rules..." stays in untrusted evidence; diagnosis JSON still `unsupported_claim` |
| Schema / parse traps | Implemented | Malformed JSON, extra fields, illegal status/reason pairs, URL refs, empty/non-object claims |
| Metamorphic invariants | Implemented | Mutate number, swap citation, reorder artifacts, add irrelevant evidence, remove required evidence |
| Offline runner | Implemented | `npm run test:reliability` and `npm run eval:reliability` — 31/31 expected, exit 1 on surprise |
| LLM jailbreak resistance | Not established | No model was called; section isolation is not robustness |
| Scientific metric / comparison confirmation | Blocked | Pending Caijia review; unchanged from W1.4 / W1.6 |

**Not changed:** collection, consent, production D1, camera, deployment, metric identifiers, units, protocol compatibility tables, or Caijia review items.

**Checks actually run (2026-10-19, W1.7):**
- `npm test` — 72 passed, 0 failed (11 agent-eval + 7 agent-reliability + 23 agent-tools + 16 analysis-adapter + 6 analysis-integration + 4 collection + 5 research).
- `npm run test:integration` — 6 passed, 0 failed.
- `npm run test:reliability` — 7 passed, 0 failed.
- `npm run eval:reliability` — 31/31 expected (`numeric_integrity` 5, `evidence_provenance` 5, `evidence_quality` 8, `prompt_injection` 1, `schema_parsing` 7, `metamorphic` 5).
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run (collection/cloud unchanged).
- No LLM API call was made.

**Next task:** keep scientific review blocked for Caijia. Optional later work is a live ChatGPT measurement of the injection fixture; that would be LLM behavioral evaluation, not a reason to mark this contract suite as robustness. Do not merge this PR to `main`.

## W1.6 integration and end-to-end validation (2026-10-19)

**Status:** Implemented and verified in synthetic tests plus typecheck/build. Engineering integration of PR #4 and PR #5 only. Not an LLM API, not scientifically validated, not deployed, and not a reader of production D1 or camera streams.

Implementation branch: `cursor/w1-integration-4e29` @ `d9b8b4c`. Integration base: PR #5 (`cursor/w1-eval-harness-4e29` @ `4d7960d`) merged with PR #4 (`cursor/w1-export-adapter-4e29` @ `ae7f543`). Both remain stacked on PR #2 (`cursor/w1-agent-tools-4e29` @ `5e8f791`). Source: `analysis/src/neurolens/eval/pipeline.mjs`. Tests: `tests/analysis-integration.test.mjs`. Design: [analysis-integration.md](../architecture/analysis-integration.md).

This slice does **not** add an LLM provider. A valid synthetic V1 export can travel adapter → immutable evidence → read-only tools → prompt builder → `validateAgentAnswer` → `agent-eval-report/0.1`.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| PR #4 + #5 coexistence | Implemented | Adapter modules and eval harness are both present; validator tokens auto-merged |
| Valid export pipeline (Test A) | Implemented | `camera-behavior-a.json` → tools → prompt → accepted gold answer |
| Numeric fidelity (Test B) | Implemented | Drifted `999` rejected as `numeric_mismatch` |
| Session binding (Test C) | Implemented | Camera-B artifact cited for camera A rejected as `session_mismatch` |
| Missing / unusable metrics (Test D) | Implemented | `missing-rt.json` abstains; no fabricated numeric claim |
| Protocol incompatibility (Test E) | Implemented | Camera A vs other-protocol abstains `incompatible_protocol` |
| Eval-case regression (Test F) | Implemented | Seven W1.5 cases still gold-pass / trap-fail |
| Offline reproducibility command | Implemented | `npm run test:integration` — no API key, no network |
| Scientific metric / comparison confirmation | Blocked | Pending Caijia review; unchanged from W1.4 |
| Real-export / camera / LLM validation | Not started | Synthetic fixtures only; no provider runtime |

**Contracts preserved:** `agent-tools/0.1`, `agent-answer/0.1`, `research-agent-prompt/0.1`, V1 schema `1.0.0`, protocol `go-no-go-v1` → `go-no-go/1.0`. Metrics remain `reaction_time_median_ms` (ms), `accuracy` (proportion), `valid_trial_count` (count). Adapter does not fabricate missing measurements.

**Conflicts resolved:** documentation union in `analysis/README.md`, `docs/README.md`, `docs/architecture/overview.md`, `docs/architecture/repository-layout.md`, and `docs/planning/implementation-status.md`. `validate.mjs` auto-merged (PR #4 export tokens + shared `coverage: 'all'`).

**Not changed:** collection modules, consent, cloud allowlists, production D1, mission preview, deployment. PRs #2, #4, and #5 were not merged to `main` from this work.

**Checks actually run (2026-10-19, W1.6):**
- `npm test` — 65 passed, 0 failed (11 agent-eval + 23 agent-tools + 16 analysis-adapter + 6 analysis-integration + 4 collection + 5 research).
- `npm run test:integration` — 6 passed, 0 failed.
- `npm run test:flow` — PASS (collection graph unchanged; rerun for regression).
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run (requires initialized local D1 and preview; collection/cloud paths unchanged).
- No LLM API call was made.

**Next task:** Caijia review of metric identifiers, units, `n` definitions, and simulated-versus-camera comparison. Keep PR #2/#4/#5 unmerged from this work. Do not treat a green integration report as scientific validation.

## W1.5 API-independent LLM prompt and evaluation harness (2026-10-19)

**Status:** Implemented and verified in synthetic tests. Manual ChatGPT workflow only. Not an LLM API, not scientifically validated, not deployed.

Implementation PR: [#5](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/5) (`cursor/w1-eval-harness-4e29` @ `fe311fe`), based on PR #2 (`cursor/w1-agent-tools-4e29` @ `5e8f791`). Source: `analysis/src/neurolens/eval/`. Tests: `tests/agent-eval.test.mjs`. Design: [agent-eval.md](../architecture/agent-eval.md).

This slice originally shipped independently of W1.4. It uses the PR #2 fixture catalog and answer validator. LLM output is never trusted without `validateAgentAnswer`. W1.6 later wires the same harness to export-backed tools.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Versioned system prompt | Implemented | `analysis/prompts/research-agent-prompt-0.1.md` |
| Deterministic prompt builder | Implemented | Question, tool manifest, validated evidence, schema, limitations |
| Synthetic eval cases | Implemented | Seven cases covering the W1.5 matrix |
| Manual CLI | Implemented | `scripts/eval-agent.mjs` list/export/validate/self-check |
| Programmatic scoring | Implemented | `agent-eval-report/0.1` over `validateAgentAnswer` |
| Live ChatGPT measurement | Not started | Researcher must paste prompts by hand |
| LLM API / provider runtime | Out of scope | No keys or network |

**Not changed:** collection, consent, production D1, camera, deployment.

**Checks actually run (2026-10-19, W1.5):**
- `npm test` — 43 passed, 0 failed (11 agent-eval + 23 agent-tools + 4 collection + 5 research).
- `npm run test:flow` — PASS.
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run (collection/cloud unchanged).
- No ChatGPT session was submitted from this environment.

**Next task:** optional human ChatGPT dry-run of one exported case; keep PR #2/#4 unmerged from the original W1.5 work.

## W1.4 offline session-export adapter (2026-10-19)

**Status:** Implemented and verified in synthetic tests plus typecheck/build. Engineering integration only. Not scientifically validated, not an LLM runtime, not deployed, and not a reader of production D1 or camera streams.

Implementation PR: [#4](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/4) (`cursor/w1-export-adapter-4e29` @ `6ba029a`), based on PR #2 (`cursor/w1-agent-tools-4e29` @ `5e8f791`). Source: `analysis/src/neurolens/adapter/`. Tests: `tests/analysis-adapter.test.mjs`. Design: [analysis-export-adapter.md](../architecture/analysis-export-adapter.md).

PRs #1, #2 and #3 had no reviews when this slice was coded. Caijia has not confirmed the three metric definitions or comparison-coverage science. The adapter therefore copies only the existing PR #2 allowlist and records blocked mappings in the adapter document.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Fail-closed V1 JSON accept/reject | Implemented | Rejects mission-preview, demo, CSV, unknown schema, missing `behavior_summary` |
| Offline export store + tool retrieval | Implemented | `createExportAnalysisTools` serves `get_session_summary`, `compare_sessions`, `get_evidence` |
| Allowlisted metric copy | Implemented as engineering copy | `reaction_time_median_ms`, `accuracy`, `valid_trial_count` only; no zero-fill |
| Privacy redaction | Implemented | Artifacts omit participant id, user agent, notes, events, withdrawal tokens |
| Multi-session citation coverage | Implemented | `validateAgentAnswer` `coverage: 'all'`; default remains `'any'` |
| Scientific metric / comparison confirmation | Blocked | Pending Caijia review; ocular and fatigue fields stay unmapped |
| Real-export / camera validation | Not started | Synthetic fixtures only |

**Not changed:** collection modules, consent, cloud allowlists, production D1, mission preview, deployment.

**Checks actually run (2026-10-19, W1.4):**
- `npm test` — 48 passed, 0 failed (23 agent-tools + 16 analysis-adapter + 4 collection + 5 research).
- `npm run test:flow` — PASS (collection graph unchanged; rerun for regression).
- `npx --no-install tsc --noEmit` — exited 0.
- `npm run build` — vinext/Vite production build completed.
- `tests/integration.mjs` was not run (requires initialized local D1 and preview; collection/cloud paths unchanged).

**Next task:** Caijia review of metric identifiers, units, `n` definitions and whether simulated-vision behavioral numbers may ever be compared with camera sessions. Do not merge PR #2 or PR #3 from this work.

## W1 evidence-grounded agent tools (2026-10-19)

**Status:** Implemented, hardened, and verified in synthetic tests plus typecheck/build. Not an LLM runtime, not scientifically validated, not deployed.

Linxi W1 vertical slice follows the proposed contract in PR #1 and [DEC-003](decision-log.md). Implementation PR: [#2](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/2) (`cursor/w1-agent-tools-4e29`). Source: `analysis/src/neurolens/agent/`. Tests: `tests/agent-tools.test.mjs`. Contract note: [agent-tools.md](../architecture/agent-tools.md).

W1.2 hardening (same PR): session-bound citations, tool-response/artifact agreement, complete comparison catalog so every OK `artifact_ref` is retrievable, deep-frozen fixtures, extra-field rejection, and fail-closed catalog mismatch.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Read-only analysis tool interface | Implemented | `createAnalysisTools().invoke` allowlists `get_session_summary`, `compare_sessions`, `get_evidence` |
| Evidence artifact + provenance | Implemented | `evidence-artifact/0.1` with immutable `deterministic_fixture_lookup` provenance |
| Structured output validation | Implemented | Request, response, artifact and answer validators; numeric claim-to-artifact match; session-binding and envelope/artifact agreement |
| Deterministic mock tools | Implemented | Synthetic catalog only; no network, camera, D1 or filesystem retrieval |
| W1 test matrix | Verified in tests | Original matrix plus session mismatch, dangling comparison refs, catalog inconsistency, frozen fixtures, extra fields |
| LLM provider / retrieval over real analyses | Planned | W6 agent runtime; W1 composer is deterministic only |
| Scientific validity of fixture numbers | Not applicable | Fixtures are synthetic and cannot establish empirical performance |

**Not changed:** collection modules, consent, cloud allowlists, mission preview, deployment.

**Checks actually run (2026-10-19, W1.2):**
- `npm test` — 31 passed, 0 failed (22 agent-tools + 4 collection + 5 research).
- `npm run test:flow` — PASS (controlled DOM/clock collection graph).
- `npx tsc --noEmit` — first run failed because `node_modules` was absent and `npx` fetched the unrelated `tsc@2.0.4` package; after `npm run install:ci`, `npx --no-install tsc --noEmit` exited 0.
- `npm run build` — vinext/Vite production build completed after the same install.
- `tests/integration.mjs` was not run (requires initialized local D1 and preview; collection/cloud paths unchanged).

**Next task:** Caijia review of `metric_id` / units / protocol compatibility; keep mission-integration work on a separate branch. Do not treat this slice as Stage F completion.

## Current cross-branch status (2026-10-13 Toronto)

Canonical main runtime: `3c3f0aa`. Reviewed preview runtime: `663ed79`, branch `preview/mission-live-camera-v0.3`. Documentation updates do not merge or deploy preview code.

| Capability | Main | Mission preview |
|---|---|---|
| Modular collection / optional cloud workflow | Implemented; real-device validation pending | Original main code retained; preview itself has no uploads |
| English multi-screen mission journey | Not integrated | Implemented; browser flow not verified |
| PVT-inspired + Go/No-Go sequence | Go/No-Go only | Implemented: 3 + 4 minutes |
| Three timestamped fatigue ratings | Pre/post only | Pre/between/post implemented |
| Live eye-state card throughout tasks | Basic collector feedback | Implemented per task, including stale/no-face/unavailable states |
| Local history / JSON and CSV | Implemented, schema 1.0.0 | Implemented separately, schema mission-preview-1 |
| Facial dynamics / screen gaze / thought probes | Planned | Still absent |
| Statistical research / ML | Planned | Still absent |

Preview review reran `npm run check` and `npm test`; all 16 synthetic unit tests passed. No new real-browser or camera validation was performed. The review identified missing task-start frame filtering and a calibration timeout dependent on receiving frames; these are integration blockers, not completed fixes.

Next work: [stabilize and port the preview](mission-integration.md). The earlier V1 audit below describes main, not preview availability.

Snapshot: main at 2f72e925e1c90d113cb6a549c14a46b393a5eb3f, audited 2026-10-10 Toronto time. This snapshot is the original capability audit. The module refactor below changes code organization; it does not implement V2 research features.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Browser camera + local MediaPipe Worker | Implemented; device validation pending | camera.js, tracker.worker.js; real-person/Safari validation outstanding |
| Blink/closure features | Implemented; measurement validation pending | core.js FeatureAccumulator; approximate 10 Hz capture can miss short events |
| Iris position variation | Partial | core.js gaze_x/y and SD; uncalibrated eye-width proxy |
| Screen gaze, dwell, off-screen events | Planned | No screen calibration or dwell segmentation |
| Facial dynamics | Planned | Worker does not request outputFaceBlendshapes |
| Head movement | Partial | Rotation matrix and mean angular movement; no event segmentation |
| Go/No-Go performance | Implemented | app.js + summarizeTrials; one task |
| Fatigue self-ratings | Implemented | Pre/post 1–10; no dedicated resting baseline |
| Thought probes / mind-wandering labels | Planned | No probe engine |
| Confounder questionnaire | Planned | No structured sleep/caffeine/lighting capture |
| Statistical research | Planned | Descriptive summaries only; no inferential analysis |
| ML / independent evaluation | Planned | No model or Python analysis pipeline |
| Local dashboard and exports | Implemented, basic | EAR/RT plots, summaries, IndexedDB history |
| Cloud research workflow | Implemented; production verification incomplete | API, private dashboard, D1, consent, deduplication, withdrawal |
| Video/interview/attention research extensions | Planned | No task adapters yet |

## Verification evidence

During the repository audit, five existing tests in tests/research.test.mjs passed. They test sanitization, consent/rating validation, source consistency, IDs and limits; they do not validate ocular measurements.

README records prior typecheck/build/local API and simulated-browser checks. Those were not rerun in this documentation change. Real-person tracking, production researcher sign-in and research validity are not established by those checks.

## Updating status

Use Planned / Partial / Implemented / Validated, explicitly naming what was validated. Add source path and test/pilot evidence. Do not mark a roadmap step complete merely because its document exists.

## Modular-base handoff (2026-10-10 Toronto)

Refactored collection into tracking, features, tasks, session, reporting, persistence and shared modules; server helpers/validation now live in lib/research/. Preserved legacy entrypoints, static vendor paths, IndexedDB identity, schema and protocol. Corrected the task-only source label to recognize `unavailable` as no vision.

Checks: nine unit tests; controlled-DOM/clock flow covering consent, demo, simulated completion/save and task-only interruption; local D1 API integration covering authorization, upload consent, deduplication, export, withdrawal and replay prevention. TypeScript checking and the final production build both passed.

Browser automation could not run because the available Playwright browser executable was absent and its download failed. Controlled-DOM checks are not real-browser/real-person validation. Real camera and Safari validation remain pending. No production deployment is part of this refactor.

Next task: Step 1 real-device/measurement QA; Step 2 module extraction is complete, but facial features, head events and their acceptance gates remain planned. Other contributors should extend domain modules rather than the compatibility facades.
