# Manual research-agent evaluation

API-independent workflow. Synthetic fixtures only. See [agent-eval.md](../../docs/architecture/agent-eval.md).

```sh
npm run eval:agent -- list
npm run eval:agent -- export valid-metric-rt --out /tmp/nl-eval
# paste /tmp/nl-eval/prompt.md into ChatGPT, save JSON as response.json
npm run eval:agent -- validate valid-metric-rt --response /tmp/nl-eval/response.json --out /tmp/nl-eval/report.json
npm run eval:agent -- self-check
```

Do not commit ChatGPT replies or participant data. Local runs can use `analysis/eval-runs/` (gitignored).
