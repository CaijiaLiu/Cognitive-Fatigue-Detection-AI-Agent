# NeuroLens analysis / agent tools

Offline, read-only analysis boundary for the evidence-grounded research agent.

W1 implements a deterministic tool interface, evidence artifacts with provenance, structured output validation, and synthetic fixtures. It does **not** call an LLM, access the camera collector, read production D1, or claim scientific or clinical validity.

| Path | Responsibility |
|---|---|
| `src/neurolens/agent/` | Allowlisted tools, artifact schema, validators, mock catalog |
| `src/neurolens/adapter/` | Offline V1 JSON export → versioned evidence artifacts |
| `src/neurolens/eval/` | API-independent prompt builder, answer harness, and W1.6 offline pipeline |
| `prompts/` | Versioned research-agent system prompt |
| `fixtures/exports/` | Synthetic V1-format exports only |
| `../tests/agent-tools.test.mjs` | Numeric fidelity, missing evidence, protocol mismatch, unsupported claims |
| `../tests/analysis-adapter.test.mjs` | Export validation, privacy, coverage and tool retrieval |
| `../tests/agent-eval.test.mjs` | Prompt package, gold/trap scoring and CLI tests |
| `../tests/analysis-integration.test.mjs` | End-to-end export → tools → prompt → validator tests |

Offline pipeline (no API key): `npm run test:integration`. Manual ChatGPT scoring: `npm run eval:agent -- export valid-metric-rt --out /tmp/nl-eval`. See [analysis-integration.md](../docs/architecture/analysis-integration.md) and [agent-eval.md](../docs/architecture/agent-eval.md).

Run `npm test`. Simulated fixtures and copied export summaries cannot establish empirical performance.
