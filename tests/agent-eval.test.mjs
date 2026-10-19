import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ANSWER_VERSION, REASON_CODES } from '../analysis/src/neurolens/agent/constants.mjs';
import {
  CASE_CATEGORIES,
  EVAL_CASES,
  REQUIRED_PROMPT_SECTIONS,
  buildPromptPackage,
  evaluateAnswer,
  getEvalCase,
  listEvalCases,
  loadSystemPrompt,
  parseModelResponse,
  publicCaseMeta,
  selfCheckAll,
} from '../analysis/src/neurolens/eval/index.mjs';

const NOW = '2026-10-19T03:00:00.000Z';

function packageFor(id) {
  return buildPromptPackage(getEvalCase(id));
}

test('eval cases cover the required W1.5 categories', () => {
  const listed = listEvalCases();
  assert.equal(listed.length, 7);
  assert.deepEqual(new Set(listed.map((item) => item.category)), new Set(Object.values(CASE_CATEGORIES)));
  assert.equal(EVAL_CASES.length, listed.length);
});

test('prompt builder is deterministic and includes required sections', () => {
  const first = packageFor('valid-metric-rt');
  const second = packageFor('valid-metric-rt');
  assert.equal(first.user_prompt, second.user_prompt);
  assert.equal(first.system_prompt, loadSystemPrompt());
  for (const key of REQUIRED_PROMPT_SECTIONS) {
    assert.ok(first.sections[key], `missing section ${key}`);
    assert.match(first.user_prompt, new RegExp(key.replaceAll('_', ' '), 'i'));
  }
  assert.match(first.user_prompt, /What is the median reaction time/);
  assert.match(first.user_prompt, /get_session_summary/);
  assert.match(first.user_prompt, /fixture:session-summary:a/);
  assert.match(first.user_prompt, /320/);
  assert.equal(first.expected.claims[0].value, 320);
  assert.equal(JSON.stringify(publicCaseMeta(first)).includes('"claims"'), false);
  assert.doesNotMatch(first.user_prompt, /"status": "answered"/);
});

test('system prompt forbids clinical conclusions and requires JSON only', () => {
  const prompt = loadSystemPrompt();
  assert.match(prompt, /research-agent-prompt\/0\.1/);
  assert.match(prompt, /ADHD/);
  assert.match(prompt, /JSON object and nothing else/);
  assert.match(prompt, /agent-answer\/0\.1/);
});

test('bundled system prompt matches the versioned markdown file', () => {
  const fromFile = readFileSync(new URL('../analysis/prompts/research-agent-prompt-0.1.md', import.meta.url), 'utf8').trim();
  assert.equal(loadSystemPrompt(), fromFile);
});

test('gold answers pass the harness for every case', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error('network should not be used'));
  };
  try {
    const rows = selfCheckAll({ now: NOW });
    assert.equal(fetchCalls, 0);
    for (const row of rows) {
      assert.equal(row.gold_passes, true, row.case_id);
      assert.equal(row.failures_caught, true, row.case_id);
      assert.equal(row.gold.evaluated_at, NOW);
    }
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
});

test('missing evidence and incompatible protocols expect abstention', () => {
  const missing = packageFor('missing-evidence-low-quality');
  assert.equal(missing.expected.status, 'abstained');
  assert.equal(missing.expected.reason_code, REASON_CODES.INSUFFICIENT_DATA);
  assert.equal(missing.artifacts.length, 0);
  assert.ok(missing.sections.validated_evidence.tool_envelopes.some((item) => item.status === 'insufficient_data'));

  const incompatible = packageFor('incompatible-protocols');
  assert.equal(incompatible.expected.status, 'abstained');
  assert.equal(incompatible.expected.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
});

test('unsupported medical questions abstain and keep empty evidence', () => {
  const pkg = packageFor('unsupported-medical-claim');
  assert.equal(pkg.expected.status, 'abstained');
  assert.equal(pkg.expected.reason_code, REASON_CODES.UNSUPPORTED_CLAIM);
  assert.deepEqual(pkg.artifacts, []);
  assert.match(pkg.user_prompt, /ADHD/);
});

test('fabricated values fail numeric fidelity', () => {
  const pkg = packageFor('fabricated-value');
  const report = evaluateAnswer(pkg, pkg.sample_failures[0].answer, { now: NOW, model_source: 'synthetic_failure' });
  assert.equal(report.result, 'fail');
  assert.equal(report.validator.reason_code, REASON_CODES.NUMERIC_MISMATCH);
  assert.equal(report.checks.find((item) => item.name === 'numeric_fidelity').passed, false);
});

test('incorrect citations fail session binding', () => {
  const pkg = packageFor('incorrect-citation');
  assert.equal(pkg.extra_artifacts[0].artifact_ref, 'fixture:session-summary:b');
  const report = evaluateAnswer(pkg, pkg.sample_failures[0].answer, { now: NOW, model_source: 'synthetic_failure' });
  assert.equal(report.result, 'fail');
  assert.equal(report.validator.reason_code, REASON_CODES.SESSION_MISMATCH);
  assert.equal(report.checks.find((item) => item.name === 'citation_binding').passed, false);
});

test('comparison coverage all rejects a one-session citation', () => {
  const pkg = packageFor('valid-comparison-rt');
  const bad = {
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{
      text: 'The fixture reaction_time_median_ms is 320 ms.',
      metric_id: 'reaction_time_median_ms',
      value: 320,
      unit: 'ms',
      artifact_refs: ['fixture:session-summary:a'],
    }],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  };
  const report = evaluateAnswer({
    ...pkg,
    extra_artifacts: [packageFor('valid-metric-rt').artifacts[0]],
  }, bad, { now: NOW });
  assert.equal(report.result, 'fail');
  assert.equal(report.validator.reason_code, REASON_CODES.SESSION_MISMATCH);
  assert.equal(report.report_version, 'agent-eval-report/0.1');
});

test('fenced JSON is accepted and surrounding prose is rejected', () => {
  const pkg = packageFor('valid-metric-rt');
  const gold = pkg.expected;
  const fenced = `\`\`\`json\n${JSON.stringify({
    answer_version: ANSWER_VERSION,
    status: gold.status,
    claims: gold.claims,
    limitations: gold.limitations,
  })}\n\`\`\``;
  assert.equal(evaluateAnswer(pkg, fenced, { now: NOW }).result, 'pass');
  assert.equal(parseModelResponse('Here is the answer: {"status":"answered"}').ok, false);
});

test('CLI exports a prompt package and validates a gold response without network', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nl-eval-'));
  try {
    const exportRun = spawnSync(process.execPath, [
      'scripts/eval-agent.mjs',
      'export',
      'valid-metric-rt',
      '--out',
      dir,
    ], { encoding: 'utf8' });
    assert.equal(exportRun.status, 0, exportRun.stderr);
    assert.match(readFileSync(join(dir, 'prompt.md'), 'utf8'), /validated evidence/i);
    assert.equal(JSON.parse(readFileSync(join(dir, 'case.meta.json'), 'utf8')).case_id, 'valid-metric-rt');

    const pkg = packageFor('valid-metric-rt');
    writeFileSync(join(dir, 'response.json'), `${JSON.stringify({
      answer_version: ANSWER_VERSION,
      status: pkg.expected.status,
      claims: pkg.expected.claims,
      limitations: pkg.expected.limitations,
    })}\n`);
    const validateRun = spawnSync(process.execPath, [
      'scripts/eval-agent.mjs',
      'validate',
      'valid-metric-rt',
      '--response',
      join(dir, 'response.json'),
      '--out',
      join(dir, 'report.json'),
    ], { encoding: 'utf8' });
    assert.equal(validateRun.status, 0, validateRun.stderr);
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    assert.equal(report.result, 'pass');
    assert.equal(report.model_source, 'manual_chatgpt');

    const urlRun = spawnSync(process.execPath, [
      'scripts/eval-agent.mjs',
      'validate',
      'valid-metric-rt',
      '--response',
      'https://example.test/response.json',
    ], { encoding: 'utf8' });
    assert.notEqual(urlRun.status, 0);
    assert.match(urlRun.stderr, /local file path/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
