# NeuroLens analysis / agent tools

Offline, read-only analysis boundary for the evidence-grounded research agent.

W1 implements a deterministic tool interface, evidence artifacts with provenance, structured output validation, and synthetic fixtures. It does **not** call an LLM, access the camera collector, read production D1, or claim scientific or clinical validity.

| Path | Responsibility |
|---|---|
| `src/neurolens/agent/` | Allowlisted tools, artifact schema, validators, mock catalog |
| `src/neurolens/adapter/` | Offline V1 JSON export → versioned evidence artifacts |
| `fixtures/exports/` | Synthetic V1-format exports only |
| `../tests/agent-tools.test.mjs` | Numeric fidelity, missing evidence, protocol mismatch, unsupported claims |
| `../tests/analysis-adapter.test.mjs` | Export validation, privacy, coverage and tool retrieval |

Run `npm test`. Simulated fixtures and copied export summaries cannot establish empirical performance.
