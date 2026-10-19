# NeuroLens analysis / agent tools

Offline, read-only analysis boundary for the evidence-grounded research agent.

W1 implements a deterministic tool interface, evidence artifacts with provenance, structured output validation, and synthetic fixtures. It does **not** call an LLM, access the camera collector, read production D1, or claim scientific or clinical validity.

| Path | Responsibility |
|---|---|
| `src/neurolens/agent/` | Allowlisted tools, artifact schema, validators, mock catalog |
| `../tests/agent-tools.test.mjs` | Numeric fidelity, missing evidence, protocol mismatch, unsupported claims |

Run `npm test`. Simulated fixtures cannot establish empirical performance.
