#!/usr/bin/env node
/**
 * Manual, API-independent NeuroLens research-agent evaluation.
 * Export a prompt package, paste it into ChatGPT, then validate the JSON reply.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildPromptPackage,
  evaluateAnswer,
  getEvalCase,
  listEvalCases,
  publicCaseMeta,
  renderPastePrompt,
  selfCheckAll,
} from '../analysis/src/neurolens/eval/index.mjs';

function printHelp() {
  process.stdout.write(`NeuroLens research-agent evaluation (no API)

Usage:
  node scripts/eval-agent.mjs list
  node scripts/eval-agent.mjs export <case-id> --out <dir>
  node scripts/eval-agent.mjs validate <case-id> --response <file.json> [--out report.json]
  node scripts/eval-agent.mjs self-check

Example:
  node scripts/eval-agent.mjs export valid-metric-rt --out /tmp/nl-eval
  # Paste /tmp/nl-eval/prompt.md into ChatGPT. Save the JSON reply.
  node scripts/eval-agent.mjs validate valid-metric-rt --response /tmp/nl-eval/response.json --out /tmp/nl-eval/report.json

Do not pass URLs. Do not commit participant data. Fixture cases are synthetic.
`);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function assertLocalPath(value, label) {
  if (value === null) {
    throw new Error(`${label} is required.`);
  }
  if (/^[a-z]+:\/\//i.test(value) || value.includes('..')) {
    throw new Error(`${label} must be a local file path, not a URL or parent path.`);
  }
  return resolve(value);
}

function cmdList() {
  for (const item of listEvalCases()) {
    process.stdout.write(`${item.id}\t${item.category}\t${item.title}\n`);
  }
}

function cmdExport(caseId, outDir) {
  const caseDef = getEvalCase(caseId);
  if (!caseDef) throw new Error(`Unknown case: ${caseId}`);
  const pkg = buildPromptPackage(caseDef);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'SYSTEM.md'), `${pkg.system_prompt}\n`);
  writeFileSync(resolve(outDir, 'USER.md'), `${pkg.user_prompt}\n`);
  writeFileSync(resolve(outDir, 'prompt.md'), `${renderPastePrompt(pkg)}\n`);
  writeFileSync(resolve(outDir, 'case.meta.json'), `${JSON.stringify(publicCaseMeta(pkg), null, 2)}\n`);
  writeFileSync(resolve(outDir, 'INSTRUCTIONS.md'), `# Manual evaluation: ${caseId}

1. Copy \`prompt.md\` (or SYSTEM.md then USER.md) into ChatGPT.
2. Do not paste \`case.meta.json\`. It has no gold answers, and the model must not see hidden keys.
3. Ask the model for JSON only.
4. Save the reply as \`response.json\` in this folder (raw JSON or a single \`\`\`json fence).
5. Run:

\`\`\`sh
node scripts/eval-agent.mjs validate ${caseId} --response ${outDir}/response.json --out ${outDir}/report.json
\`\`\`

The validator decides pass/fail. Do not treat the chat reply as trusted evidence.
`);
  process.stdout.write(`Wrote prompt package for ${caseId} to ${outDir}\n`);
}

function cmdValidate(caseId, responsePath, reportPath) {
  const caseDef = getEvalCase(caseId);
  if (!caseDef) throw new Error(`Unknown case: ${caseId}`);
  const raw = readFileSync(responsePath, 'utf8');
  const report = evaluateAnswer(buildPromptPackage(caseDef), raw, { model_source: 'manual_chatgpt' });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) {
    writeFileSync(reportPath, text);
    process.stdout.write(`Wrote ${report.result} report to ${reportPath}\n`);
  } else {
    process.stdout.write(text);
  }
  if (report.result !== 'pass') process.exitCode = 1;
}

function cmdSelfCheck() {
  const rows = selfCheckAll({ now: '2026-10-19T00:00:00.000Z' });
  for (const row of rows) {
    const status = row.gold_passes && row.failures_caught ? 'ok' : 'fail';
    process.stdout.write(`${row.case_id}\tgold=${row.gold.result}\ttraps=${row.failures_caught}\t${status}\n`);
  }
  if (rows.some((row) => !row.gold_passes || !row.failures_caught)) process.exitCode = 1;
}

try {
  const [command, caseId, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    printHelp();
  } else if (command === 'list') {
    cmdList();
  } else if (command === 'self-check') {
    cmdSelfCheck();
  } else if (command === 'export') {
    cmdExport(caseId, assertLocalPath(argValue([caseId, ...rest], '--out') ?? rest[0], '--out'));
  } else if (command === 'validate') {
    cmdValidate(
      caseId,
      assertLocalPath(argValue([caseId, ...rest], '--response'), '--response'),
      argValue([caseId, ...rest], '--out') ? assertLocalPath(argValue([caseId, ...rest], '--out'), '--out') : null,
    );
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
