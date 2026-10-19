# NeuroLens analysis / agent tools

Offline, read-only analysis boundary for the evidence-grounded research agent.

W1 implements a deterministic tool interface, evidence artifacts with provenance, structured output validation, and synthetic fixtures. It does **not** call an LLM, access the camera collector, read production D1, or claim scientific or clinical validity.

| Path | Responsibility |
|---|---|
| `src/neurolens/agent/` | Allowlisted tools, artifact schema, validators, mock catalog |
| `src/neurolens/adapter/` | Offline V1 JSON export → versioned evidence artifacts |
| `src/neurolens/eval/` | API-independent prompt builder, answer harness, and W1.6 offline pipeline |
| `src/neurolens/runtime/` | Mock-provider orchestrator, HTTP adapter, and demo view-model |
| `prompts/` | Versioned research-agent system prompt |
| `fixtures/exports/` | Synthetic V1-format exports only |
| `../tests/agent-tools.test.mjs` | Numeric fidelity, missing evidence, protocol mismatch, unsupported claims |
| `../tests/analysis-adapter.test.mjs` | Export validation, privacy, coverage and tool retrieval |
| `../tests/agent-eval.test.mjs` | Prompt package, gold/trap scoring and CLI tests |
| `../tests/analysis-integration.test.mjs` | End-to-end export → tools → prompt → validator tests |
| `../tests/agent-reliability.test.mjs` | Adversarial, prompt-boundary and metamorphic contract tests |
| `../tests/agent-runtime.test.mjs` | Runtime orchestration and fail-closed provider tests |
| `../tests/agent-api.test.mjs` | HTTP handler, allowlist, leakage and demo view-model tests |

Offline pipeline (no API key): `npm run test:integration`. Reliability suite: `npm run test:reliability` or `npm run eval:reliability`. Runtime (mock provider only): `npm run test:runtime`. HTTP/UI demo (synthetic fixtures only): `npm run test:agent-api`. Manual ChatGPT scoring: `npm run eval:agent -- export valid-metric-rt --out /tmp/nl-eval`. Interactive demo: `npm run dev` then open `/research-agent`. See [analysis-integration.md](../docs/architecture/analysis-integration.md), [agent-reliability.md](../docs/architecture/agent-reliability.md), [agent-eval.md](../docs/architecture/agent-eval.md), [agent-runtime.md](../docs/architecture/agent-runtime.md) and [agent-api.md](../docs/architecture/agent-api.md).

Run `npm test`. Simulated fixtures and copied export summaries cannot establish empirical performance.
