import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REASON_CODES } from '../analysis/src/neurolens/agent/constants.mjs';
import {
  CASE_STATUS,
  FAILURE_CATEGORY,
  OUTCOME_CLASS,
  annotateEvalCase,
  assertReportHasNoSecrets,
  classifyOutcome,
  computeModelMetrics,
  computeOperationalMetrics,
  computeRuntimeMetrics,
  describeFailure,
  enrichLlmEvalReport,
  estimateUpperBoundUsd,
  fingerprintCases,
  fingerprintFixtures,
  fingerprintPrompt,
  formatLlmEvalMarkdown,
  listLivePlanCases,
  listLlmEvalCases,
  runLlmEvalSuite,
} from '../analysis/src/neurolens/eval/index.mjs';
import { buildLlmEvalReport } from '../analysis/src/neurolens/eval/llm-report.mjs';
import { buildLiveDryRun } from '../scripts/eval-llm.mjs';

const KEY = 'sk-test-not-a-real-secret-key-value';

async function withoutNetwork(fn) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    return Promise.reject(new Error('network should not be used'));
  };
  try {
    return await fn(() => calls);
  } finally {
    if (original === undefined) delete globalThis.fetch;
    else globalThis.fetch = original;
  }
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test('live-12 plan accounts invocations and excludes runtime skips from model metrics', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const planned = listLivePlanCases();
    assert.equal(planned.length, 12);
    assert.deepEqual(planned.map((item) => item.id), [
      'llm-valid-rt',
      'llm-valid-accuracy',
      'llm-valid-trials',
      'llm-valid-compare-rt',
      'llm-correct-citation',
      'llm-low-quality',
      'llm-incompatible-protocols',
      'llm-missing-metric',
      'llm-unsupported-intent',
      'llm-fatigue-diagnosis',
      'llm-adhd-diagnosis',
      'llm-injection-in-evidence',
    ]);
    const report = await runLlmEvalSuite({
      plan: 'live-12',
      env: {},
      now: '2026-10-19T08:00:00.000Z',
      git_sha: 'a'.repeat(40),
    });
    assert.equal(report.counts.attempted, 12);
    assert.equal(report.experiment.provider_invocations, 6);
    assert.equal(report.experiment.runtime_skips, 6);
    assert.equal(report.outcome_counts.A_RUNTIME_SKIP, 6);
    assert.equal(report.outcome_counts.B_MODEL_GROUNDED, 5);
    assert.equal(report.outcome_counts.D_VALIDATOR_REJECT, 1);
    assert.equal(report.model_metrics.grounded_answer_accuracy.denominator, 5);
    assert.ok(report.model_metrics.grounded_answer_accuracy.denominator < 12);
    assert.equal(report.runtime_metrics.evidence_gate_rejection_correctness.denominator, 3);
    assert.equal(report.cases.filter((row) => row.outcome_class === OUTCOME_CLASS.A_RUNTIME_SKIP)
      .every((row) => row.actual.provider_invoked === false), true);
    assert.equal(fetchCalls(), 0);
  });
});

test('provider errors, invalid JSON, numeric mismatch, and bad citations are classified', async () => {
  await withoutNetwork(async () => {
    const report = await runLlmEvalSuite({
      env: {},
      now: '2026-10-19T08:00:00.000Z',
      git_sha: 'b'.repeat(40),
    });
    const byId = Object.fromEntries(report.cases.map((row) => [row.id, row]));
    assert.equal(byId['llm-override-system'].event_category, FAILURE_CATEGORY.MODEL_INVALID_JSON);
    assert.equal(byId['llm-fabricated-value'].event_category, FAILURE_CATEGORY.MODEL_NUMERIC_MISMATCH);
    assert.equal(byId['llm-wrong-session-cite'].event_category, FAILURE_CATEGORY.MODEL_INVALID_CITATION);
    assert.equal(byId['llm-unknown-artifact-cite'].event_category, FAILURE_CATEGORY.MODEL_INVALID_CITATION);
    assert.equal(byId['llm-clinical-inference'].event_category, FAILURE_CATEGORY.MODEL_UNSAFE_MEDICAL_INFERENCE);
    assert.equal(byId['llm-override-system'].failure, null);
    assert.equal(byId['llm-low-quality'].failure, null);
    assert.equal(byId['llm-low-quality'].outcome_class, OUTCOME_CLASS.A_RUNTIME_SKIP);

    const rateLimited = annotateEvalCase({
      id: 'llm-rate',
      case_status: CASE_STATUS.PROVIDER_ERROR,
      expected: { answer_status: 'answered', provider_invoked: true },
      actual: {
        answer_status: 'abstained',
        provider_invoked: true,
        failure_class: 'provider',
        reason_code: REASON_CODES.PROVIDER_UNAVAILABLE,
        failure_reason: 'OpenAI rate-limited the request.',
        validator_ok: false,
      },
      scores: {},
    });
    assert.equal(rateLimited.outcome_class, OUTCOME_CLASS.E_PROVIDER_ERROR);
    assert.equal(rateLimited.failure.category, FAILURE_CATEGORY.PROVIDER_RATE_LIMIT);
  });
});

test('unexpected abstention is classified only on provider-invoked rows', () => {
  const row = annotateEvalCase({
    id: 'llm-valid-rt',
    group: 'A_valid_grounded',
    case_status: CASE_STATUS.FAIL,
    expected: { answer_status: 'answered', layer: 'model_success', provider_invoked: true },
    actual: {
      answer_status: 'abstained',
      provider_invoked: true,
      failure_class: 'none',
      validator_ok: true,
      reason_code: null,
    },
    scores: { e2e_match: false, abstention_correct: true },
  });
  assert.equal(classifyOutcome(row), OUTCOME_CLASS.C_MODEL_ABSTAINED);
  assert.equal(describeFailure(row).category, FAILURE_CATEGORY.MODEL_UNEXPECTED_ABSTENTION);
});

test('missing usage and missing cost stay NOT_MEASURED, not zero', async () => {
  await withoutNetwork(async () => {
    const report = await runLlmEvalSuite({
      plan: 'live-12',
      env: {},
      now: '2026-10-19T08:00:00.000Z',
      git_sha: 'c'.repeat(40),
    });
    assert.equal(report.operational_metrics.token_usage.status, 'NOT_MEASURED');
    assert.equal(report.operational_metrics.estimated_cost_usd.status, 'NOT_MEASURED');
    assert.equal(report.operational_metrics.estimated_cost_usd.value, null);
    assert.equal(estimateUpperBoundUsd({
      max_requests: 12,
      max_output_tokens: 400,
    }), null);
    assert.equal(estimateUpperBoundUsd({
      max_requests: 12,
      max_output_tokens: 400,
      price_input_per_1k: 0.15,
      price_output_per_1k: 0.6,
      assumed_input_tokens: 1500,
    }), 5.58);
  });
});

test('partial and interrupted runs mark remaining cases NOT_RUN', async () => {
  await withoutNetwork(async () => {
    const report = await runLlmEvalSuite({
      plan: 'live-12',
      env: { NEUROLENS_AGENT_MAX_REQUESTS: '1' },
      now: '2026-10-19T08:00:00.000Z',
      git_sha: 'd'.repeat(40),
    });
    assert.equal(report.status, 'stopped');
    assert.equal(report.reason, 'max_requests');
    assert.equal(report.counts.status.NOT_RUN >= 1, true);
    assert.equal(report.experiment.incomplete_cases >= 1, true);
    assert.equal(report.operational_metrics.incomplete_count, report.experiment.incomplete_cases);
  });
});

test('fingerprints are stable and reports redact secrets', async () => {
  await withoutNetwork(async () => {
    const first = fingerprintPrompt();
    const second = fingerprintPrompt();
    assert.equal(first, second);
    assert.equal(fingerprintFixtures(), fingerprintFixtures());
    assert.equal(fingerprintCases(listLivePlanCases()), fingerprintCases(listLivePlanCases()));
    assert.notEqual(fingerprintCases(listLivePlanCases()), fingerprintCases(listLlmEvalCases()));
    const report = await runLlmEvalSuite({
      plan: 'live-12',
      env: {},
      now: '2026-10-19T08:00:00.000Z',
      git_sha: 'e'.repeat(40),
    });
    const serialized = JSON.stringify(report);
    JSON.parse(serialized);
    const markdown = formatLlmEvalMarkdown(report);
    assert.match(markdown, /Experiment Summary/);
    assert.match(markdown, /Model-level/);
    assert.match(markdown, /Engineering Recommendations/);
    assert.equal(assertReportHasNoSecrets(report), true);
    assert.equal(assertReportHasNoSecrets(markdown), true);
    assert.equal(serialized.includes(KEY), false);
    assert.equal(serialized.includes('You are a read-only'), false);
    assert.equal(report.experiment.git_sha, 'e'.repeat(40));
    assert.equal(report.experiment.prompt_fingerprint, first);
  });
});

test('zero eligible-case denominators are NOT_MEASURED', () => {
  const empty = computeModelMetrics([]);
  assert.equal(empty.grounded_answer_accuracy.status, 'NOT_MEASURED');
  assert.equal(empty.numeric_fidelity.value, null);
  const runtime = computeRuntimeMetrics([]);
  assert.equal(runtime.authorization_enforcement.status, 'NOT_MEASURED');
  const operational = computeOperationalMetrics([]);
  assert.equal(operational.timeout_rate.status, 'NOT_MEASURED');
  assert.equal(operational.latency_ms.p95_status, 'NOT_MEASURED');
  const enriched = enrichLlmEvalReport(buildLlmEvalReport({
    run_id: 'empty',
    status: 'not_run',
    live: false,
    reason: 'none',
    cases: [],
    planned: 0,
    now: '2026-10-19T08:00:00.000Z',
    provider_id: 'mock-llm-eval',
    model: 'mock-eval/0.1',
    budget: { ok: true, max_cases: 12, max_requests: 12 },
  }), { caseDefs: [], git_sha: 'f'.repeat(40) });
  assert.equal(enriched.model_metrics.grounded_answer_accuracy.status, 'NOT_MEASURED');
});

test('live dry-run does not execute and execute without opt-in is NOT RUN', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const dry = buildLiveDryRun({
      env: {},
      plan: 'live-12',
      out: '/tmp/nl-llm-dry.json',
    });
    assert.equal(dry.live_evaluation, 'DRY_RUN');
    assert.equal(dry.execute, false);
    assert.equal(dry.case_ids.length, 12);
    assert.equal(dry.concurrency, 1);
    assert.equal(dry.estimated_upper_bound_usd, null);
    const blocked = await runLlmEvalSuite({
      live: true,
      plan: 'live-12',
      env: {},
      now: '2026-10-19T08:00:00.000Z',
      git_sha: '0'.repeat(40),
    });
    assert.equal(blocked.live_evaluation, 'NOT_RUN');
    assert.equal(fetchCalls(), 0);
  });
});

test('offline provider 429 is a transport failure, not a model abstention', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const report = await runLlmEvalSuite({
      live: true,
      plan: 'live-12',
      env: {
        NEUROLENS_AGENT_ALLOW_LIVE: '1',
        NEUROLENS_AGENT_PROVIDER: 'openai',
        OPENAI_API_KEY: KEY,
        NEUROLENS_AGENT_MAX_CASES: '1',
      },
      now: '2026-10-19T08:00:00.000Z',
      git_sha: '1'.repeat(40),
      fetchImpl: async () => jsonResponse(429, { error: { message: KEY } }),
    });
    const row = report.cases[0];
    assert.equal(row.outcome_class, OUTCOME_CLASS.E_PROVIDER_ERROR);
    assert.equal(row.failure.category, FAILURE_CATEGORY.PROVIDER_RATE_LIMIT);
    assert.equal(row.case_status, CASE_STATUS.PROVIDER_ERROR);
    assert.equal(JSON.stringify(report).includes(KEY), false);
    assert.equal(fetchCalls(), 0);
  });
});

test('markdown and JSON reports can be written beside each other', async () => {
  await withoutNetwork(async () => {
    const report = await runLlmEvalSuite({
      plan: 'live-12',
      env: {},
      now: '2026-10-19T08:00:00.000Z',
      git_sha: '2'.repeat(40),
    });
    const dir = mkdtempSync(join(tmpdir(), 'nl-llm-eval-'));
    const jsonPath = join(dir, 'report.json');
    const markdown = formatLlmEvalMarkdown(report);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(dir, 'report.md'), markdown);
    const loaded = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.equal(loaded.experiment.evaluation_suite_version, report.experiment.evaluation_suite_version);
    assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /Synthetic-only|synthetic/i);
  });
});
