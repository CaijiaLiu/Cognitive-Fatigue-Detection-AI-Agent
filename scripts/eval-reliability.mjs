#!/usr/bin/env node
/**
 * Offline Research Agent reliability runner.
 * Scores deterministic adversarial and metamorphic fixtures. No LLM API.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatReliabilitySummary, runReliabilitySuite } from '../analysis/src/neurolens/eval/index.mjs';

function printHelp() {
  process.stdout.write(`NeuroLens research-agent reliability (no API)

Usage:
  node scripts/eval-reliability.mjs
  node scripts/eval-reliability.mjs --out report.json

Runs deterministic adversarial and metamorphic contract tests.
Exit code is nonzero when any case has an unexpected outcome.
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
    const out = argValue(args, '--out');
    const report = runReliabilitySuite({ now: '2026-10-19T05:00:00.000Z' });
    process.stdout.write(formatReliabilitySummary(report));
    if (out) {
      const path = assertLocalPath(out, '--out');
      writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`Wrote ${report.result} report to ${path}\n`);
    }
    if (report.result !== 'pass') process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
