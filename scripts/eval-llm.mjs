#!/usr/bin/env node
/**
 * Controlled Research Agent LLM evaluation.
 * Default: mock/scripted, no network.
 * --live prints a dry-run. Paid calls also require --execute,
 * NEUROLENS_AGENT_ALLOW_LIVE=1, and OPENAI_API_KEY.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIVE_PLAN_CASE_IDS,
  formatLlmEvalSummary,
  listLivePlanCases,
  listLlmEvalCases,
  runLlmEvalSuite,
} from '../analysis/src/neurolens/eval/llm-eval.mjs';
import {
  ASSUMED_INPUT_TOKENS,
  formatLlmEvalMarkdown,
  estimateUpperBoundUsd,
} from '../analysis/src/neurolens/eval/llm-analysis.mjs';
import { loadAgentProviderConfig, loadEvalBudget } from '../analysis/src/neurolens/runtime/config.mjs';
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_OPENAI_TIMEOUT_MS } from '../analysis/src/neurolens/runtime/constants.mjs';

function printHelp() {
  process.stdout.write(`NeuroLens research-agent LLM evaluation

Usage:
  node scripts/eval-llm.mjs
  node scripts/eval-llm.mjs --plan live-12 --out report.json
  node scripts/eval-llm.mjs --plan live-12 --live --out report.json
  node scripts/eval-llm.mjs --plan live-12 --live --execute --out report.json

Default is mock-only and never calls a network API.
--live without --execute is a dry-run and does not spend money.
--live --execute requires NEUROLENS_AGENT_ALLOW_LIVE=1, OPENAI_API_KEY,
an explicit request cap, token cap, timeout, and a local --out path.
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

function selectedCases(plan) {
  return plan === 'live-12' ? listLivePlanCases() : listLlmEvalCases();
}

export function buildLiveDryRun({ env = {}, plan = 'live-12', out = null } = {}) {
  const config = loadAgentProviderConfig({
    ...env,
    NEUROLENS_AGENT_PROVIDER: env.NEUROLENS_AGENT_PROVIDER ?? 'openai',
  });
  const budget = loadEvalBudget(env);
  const cases = selectedCases(plan);
  const maxRequests = Math.min(budget.max_requests ?? cases.length, cases.length);
  const maxTokens = config.max_output_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const upper = budget.ok && budget.pricing_configured
    ? estimateUpperBoundUsd({
      max_requests: maxRequests,
      max_output_tokens: maxTokens,
      price_input_per_1k: budget.price_input_per_1k,
      price_output_per_1k: budget.price_output_per_1k,
      assumed_input_tokens: ASSUMED_INPUT_TOKENS,
    })
    : null;
  return {
    live_evaluation: 'DRY_RUN',
    execute: false,
    plan,
    case_ids: plan === 'live-12' ? [...LIVE_PLAN_CASE_IDS] : cases.map((item) => item.id),
    provider_id: config.provider_id,
    model: config.model,
    allow_live: config.allow_live === true,
    api_key_present: config.api_key_present === true,
    max_requests: maxRequests,
    max_output_tokens: maxTokens,
    timeout_ms: config.timeout_ms ?? DEFAULT_OPENAI_TIMEOUT_MS,
    concurrency: 1,
    out,
    estimated_upper_bound_usd: upper,
    cost_assumption: `${ASSUMED_INPUT_TOKENS} input tokens + ${maxTokens} output tokens per request × ${maxRequests} requests. Estimate only; not a spending ceiling.`,
    stop_conditions: ['max_requests', 'missing_usage', 'provider_unavailable', 'timeout'],
  };
}

function formatDryRun(summary) {
  return [
    'NeuroLens LLM eval DRY-RUN (no provider calls)',
    `provider ${summary.provider_id}/${summary.model}`,
    `cases ${summary.case_ids.join(', ')}`,
    `max_requests ${summary.max_requests}  max_output_tokens ${summary.max_output_tokens}  timeout_ms ${summary.timeout_ms}  concurrency ${summary.concurrency}`,
    `estimated_upper_bound_usd ${summary.estimated_upper_bound_usd ?? 'NOT_MEASURED'}`,
    summary.cost_assumption,
    `out ${summary.out ?? '(print only)'}`,
    'Paid execution also requires --execute, NEUROLENS_AGENT_ALLOW_LIVE=1, and OPENAI_API_KEY.',
    '',
  ].join('\n');
}

function writeReports(out, report) {
  const path = assertLocalPath(out, '--out');
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  const markdownPath = path.endsWith('.json') ? path.replace(/\.json$/, '.md') : `${path}.md`;
  writeFileSync(markdownPath, formatLlmEvalMarkdown(report));
  process.stdout.write(`Wrote ${report.status} JSON to ${path}\n`);
  process.stdout.write(`Wrote Markdown to ${markdownPath}\n`);
}

const isMain = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('help')) {
      printHelp();
    } else {
      const live = args.includes('--live');
      const execute = args.includes('--execute');
      const plan = argValue(args, '--plan') ?? (live ? 'live-12' : 'all');
      const out = argValue(args, '--out');
      if (live && !execute) {
        const dry = buildLiveDryRun({ env: process.env, plan, out });
        process.stdout.write(formatDryRun(dry));
        if (out) {
          const path = assertLocalPath(out, '--out');
          writeFileSync(path, `${JSON.stringify(dry, null, 2)}\n`);
          process.stdout.write(`Wrote dry-run summary to ${path}\n`);
        }
      } else {
        if (live && execute && !out) {
          throw new Error('Paid --live --execute requires a local --out path.');
        }
        const report = await runLlmEvalSuite({
          live,
          plan,
          env: process.env,
          now: new Date().toISOString(),
        });
        process.stdout.write(formatLlmEvalSummary(report));
        if (out) writeReports(out, report);
        if (report.status === 'not_run' && live) process.exitCode = 2;
        else if (report.status === 'stopped') process.exitCode = 1;
        else if (report.status === 'completed' && report.metrics.end_to_end_validated_success_rate.value !== 1) {
          process.exitCode = 1;
        }
      }
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
