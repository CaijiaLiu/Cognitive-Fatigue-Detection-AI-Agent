# Documentation map

NeuroLens is the target research platform; Focus Lab is the existing V1 collection application. These names describe one project, not separate codebases.

| Read for | Canonical document |
|---|---|
| System boundaries and target architecture | [Architecture](architecture/overview.md) |
| Runtime and analysis data flow | [Data flow](architecture/data-flow.md) |
| Schema, provenance and compatibility | [Data contracts](architecture/data-contracts.md) |
| Existing and planned file locations | [Repository layout](architecture/repository-layout.md) |
| Evidence-grounded agent tool contract | [Agent tools](architecture/agent-tools.md) |
| Offline V1 export → evidence adapter | [Export adapter](architecture/analysis-export-adapter.md) |
| Manual LLM evaluation harness | [Agent eval](architecture/agent-eval.md) |
| Offline export → agent integration | [Analysis integration](architecture/analysis-integration.md) |
| Research Agent reliability / adversarial tests | [Agent reliability](architecture/agent-reliability.md) |
| Research Agent runtime / mock provider | [Agent runtime](architecture/agent-runtime.md) |
| Research Agent HTTP API / interactive demo | [Agent API](architecture/agent-api.md) |
| Real LLM provider / controlled evaluation | [Agent LLM provider](architecture/agent-llm-provider.md) |
| LLM evaluation methodology and failure analysis | [Agent LLM evaluation](architecture/agent-llm-evaluation.md) |
| Real LLM baseline experiment | [Agent LLM baseline](architecture/agent-llm-baseline.md) |
| Authenticated mock demo / rate limits | [Agent demo security](architecture/agent-demo-security.md) |
| Cloudflare preview architecture | [Cloudflare preview](architecture/cloudflare-preview.md) |
| Sites deployment path | [Sites deployment](architecture/sites-deployment.md) |
| Future paid-provider gates | [LLM future enablement](architecture/agent-llm-future-enablement.md) |
| Mission preview stabilization and integration | [Mission integration](planning/mission-integration.md) |
| Ordered implementation steps and release gates | [Roadmap](planning/roadmap.md) |
| Audited implementation status | [Status](planning/implementation-status.md) |
| Research questions and validation | [Research plan](research/research-plan.md) |
| Task and labeling design | [Protocols](research/protocols.md) |
| Metric definitions and limits | [Features](research/features.md) |
| Existing hosting, consent and upload behavior | [Data collection and hosting](operations/data-collection-and-hosting.md) |
| Public mock-demo procedure | [Public demo](operations/public-demo.md) |
| Preview HTTP/browser verification | [Preview verification](operations/preview-verification.md) |
| Sites preview runbook | [Sites preview deployment](operations/sites-preview-deployment.md) |
| Framework starter reference | [Starter](operations/STARTER.md) |
| Original NeuroLens proposal, historical reference | [Original framework](reference/NeuroLens_Project_Framework.md) |

All agents and contributors start with [AGENTS.md](../AGENTS.md), then architecture, status and roadmap. The original proposal is preserved for context; the merged architecture and recorded decisions govern new implementation.
