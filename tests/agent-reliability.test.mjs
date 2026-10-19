import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REASON_CODES } from '../analysis/src/neurolens/agent/constants.mjs';
import {
  ADVERSARIAL_CATEGORIES,
  ADVERSARIAL_CASES,
  INJECTION_PAYLOAD,
  RELIABILITY_REPORT_VERSION,
  formatReliabilitySummary,
  listAdversarialCases,
  runMetamorphicCases,
  runReliabilitySuite,
} from '../analysis/src/neurolens/eval/index.mjs';

const NOW = '2026-10-19T05:00:00.000Z';

function withoutNetwork(fn) {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error('network should not be used'));
  };
  try {
    return fn(() => fetchCalls);
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
}

test('adversarial fixtures cover the required reliability categories', () => {
  const listed = listAdversarialCases();
  const categories = new Set(listed.map((item) => item.category));
  assert.ok(listed.length >= 20);
  for (const required of [
    ADVERSARIAL_CATEGORIES.NUMERIC_INTEGRITY,
    ADVERSARIAL_CATEGORIES.EVIDENCE_PROVENANCE,
    ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
    ADVERSARIAL_CATEGORIES.PROMPT_INJECTION,
    ADVERSARIAL_CATEGORIES.SCHEMA_PARSING,
  ]) {
    assert.ok(categories.has(required), required);
  }
  assert.equal(ADVERSARIAL_CASES.length, listed.length);
});

test('reliability suite matches every expected reason code without network', () => {
  withoutNetwork((fetchCalls) => {
    const report = runReliabilitySuite({ now: NOW });
    assert.equal(report.report_version, RELIABILITY_REPORT_VERSION);
    assert.equal(report.result, 'pass', formatReliabilitySummary(report));
    assert.equal(report.summary.failed, 0);
    assert.ok(report.summary.total >= 25);
    assert.equal(fetchCalls(), 0);
    for (const row of report.cases) {
      assert.equal(row.passed, true, `${row.id} ${row.actual.reason_code}`);
      if (row.expected.reason_code) {
        assert.equal(row.actual.reason_code, row.expected.reason_code, row.id);
      }
    }
  });
});

test('numeric integrity cases reject fabricated, unit, metric, string, and missing-field claims', () => {
  const report = runReliabilitySuite({ now: NOW, metamorphic: false, exportQuality: false });
  const rows = Object.fromEntries(
    report.cases.filter((item) => item.category === ADVERSARIAL_CATEGORIES.NUMERIC_INTEGRITY).map((item) => [item.id, item]),
  );
  assert.equal(rows['numeric-fabricated-value'].actual.reason_code, REASON_CODES.NUMERIC_MISMATCH);
  assert.equal(rows['numeric-incorrect-unit'].actual.reason_code, REASON_CODES.NUMERIC_MISMATCH);
  assert.equal(rows['numeric-unsupported-metric'].actual.reason_code, REASON_CODES.UNKNOWN_METRIC);
  assert.equal(rows['numeric-string-value'].actual.reason_code, REASON_CODES.NUMERIC_MISMATCH);
  assert.equal(rows['numeric-missing-value-field'].actual.reason_code, REASON_CODES.MALFORMED_OUTPUT);
});

test('prompt construction keeps injected evidence out of trusted instructions', () => {
  const report = runReliabilitySuite({ now: NOW });
  const row = report.cases.find((item) => item.id === 'injection-untrusted-evidence-boundary');
  assert.ok(row);
  assert.equal(row.passed, true);
  assert.equal(row.prompt_boundary.evidence_contains_injection, true);
  assert.equal(row.prompt_boundary.system_contains_injection, false);
  assert.match(row.prompt_boundary.note, /does not prove LLM jailbreak resistance/);
  assert.equal(row.actual.reason_code, REASON_CODES.UNSUPPORTED_CLAIM);
  assert.equal(INJECTION_PAYLOAD.includes('fatigue diagnosis'), true);
});

test('metamorphic invariants hold on small fixture packages', () => {
  const rows = Object.fromEntries(runMetamorphicCases({ now: NOW }).map((item) => [item.id, item]));
  assert.equal(rows['meta-mutate-numeric'].actual.reason_code, REASON_CODES.NUMERIC_MISMATCH);
  assert.equal(rows['meta-swap-citation'].actual.reason_code, REASON_CODES.SESSION_MISMATCH);
  assert.equal(rows['meta-reorder-evidence'].passed, true);
  assert.equal(rows['meta-irrelevant-evidence'].actual.reason_code, REASON_CODES.UNSUPPORTED_CLAIM);
  assert.equal(rows['meta-remove-required-evidence'].actual.reason_code, REASON_CODES.MISSING_EVIDENCE);
});

test('reliability CLI writes a machine-readable report and fails unexpected outcomes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nl-rel-'));
  try {
    const passRun = spawnSync(process.execPath, [
      'scripts/eval-reliability.mjs',
      '--out',
      join(dir, 'report.json'),
    ], { encoding: 'utf8' });
    assert.equal(passRun.status, 0, passRun.stderr);
    assert.match(passRun.stdout, /result: pass|reliability .* pass/);
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    assert.equal(report.result, 'pass');
    assert.equal(report.report_version, RELIABILITY_REPORT_VERSION);

    const urlRun = spawnSync(process.execPath, [
      'scripts/eval-reliability.mjs',
      '--out',
      'https://example.test/report.json',
    ], { encoding: 'utf8' });
    assert.notEqual(urlRun.status, 0);
    assert.match(urlRun.stderr, /local file path/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unexpected validator outcome fails the suite', () => {
  const report = runReliabilitySuite({
    now: NOW,
    metamorphic: false,
    exportQuality: false,
    cases: [{
      id: 'forced-unexpected',
      category: ADVERSARIAL_CATEGORIES.NUMERIC_INTEGRITY,
      kind: 'reject_answer',
      title: 'Inverted expectation must fail the runner',
      eval_case: 'fabricated-value',
      answer: { not: 'json-object-enough' },
      expect: { validator_ok: true, reason_code: REASON_CODES.NUMERIC_MISMATCH },
    }],
  });
  assert.equal(report.result, 'fail');
  assert.equal(report.summary.failed, 1);
  assert.match(formatReliabilitySummary(report), /FAIL forced-unexpected/);
});
