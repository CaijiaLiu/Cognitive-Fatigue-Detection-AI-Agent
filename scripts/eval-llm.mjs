#!/usr/bin/env node
/**
 * Controlled Research Agent LLM evaluation.
 * Default: mock/scripted, no network.
 * Live OpenAI: --live plus NEUROLENS_AGENT_ALLOW_LIVE=1 and OPENAI_API_KEY.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatLlmEvalSummary, runLlmEvalSuite } from '../analysis/src/neurolens/eval/llm-eval.mjs';

function printHelp() {
  process.stdout.write(`NeuroLens research-agent LLM evaluation

Usage:
  node scripts/eval-llm.mjs
  node scripts/eval-llm.mjs --out report.json
  node scripts/eval-llm.mjs --live --out report.json

Default is mock-only and never calls a network API.
--live requires NEUROLENS_AGENT_ALLOW_LIVE=1 and OPENAI_API_KEY.
This command is not run by npm test or npm run build.
`);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function assertLocalPath(value, label) {
  if (/^[a-z]+:\/\//i.test(value) || value.includes('..')) {
    throw new Error(`${label} must be a local file path, not a URL or parent path.`);
  }
  return resolve(value);
}

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('help')) {
    printHelp();
  } else {
    const live = args.includes('--live');
    const out = argValue(args, '--out');
    const report = await runLlmEvalSuite({
      live,
      env: process.env,
      now: new Date().toISOString(),
    });
    process.stdout.write(formatLlmEvalSummary(report));
    if (out) {
      const path = assertLocalPath(out, '--out');
      writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`Wrote ${report.status} report to ${path}\n`);
    }
    if (report.status === 'not_run' && live) process.exitCode = 2;
    else if (report.status === 'stopped') process.exitCode = 1;
    else if (report.status === 'completed' && report.metrics.end_to_end_validated_success_rate.value !== 1) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
