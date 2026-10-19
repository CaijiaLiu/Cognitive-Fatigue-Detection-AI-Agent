import test from 'node:test';
import assert from 'node:assert/strict';
import { REASON_CODES } from '../analysis/src/neurolens/agent/constants.mjs';
import {
  assertNoSecretLeak,
  createConfiguredProvider,
  createOpenAIProvider,
  handleResearchAgentGet,
  handleResearchAgentPost,
  loadAgentProviderConfig,
  loadEvalBudget,
  publicProviderView,
} from '../analysis/src/neurolens/runtime/index.mjs';
import { ProviderError } from '../analysis/src/neurolens/runtime/provider.mjs';
import {
  formatLlmEvalSummary,
  listLlmEvalCases,
  runLlmEvalSuite,
} from '../analysis/src/neurolens/eval/llm-eval.mjs';
import {
  CASE_STATUS,
  LLM_EVAL_REPORT_VERSION,
  computeLlmEvalMetrics,
  estimateCostUsd,
} from '../analysis/src/neurolens/eval/llm-report.mjs';
import { buildClientPayload } from '../analysis/src/neurolens/runtime/demo-ui.mjs';
import {
  composeAnswer,
  createAnalysisTools,
  createFixtureStore,
} from '../analysis/src/neurolens/agent/index.mjs';

const ORIGIN = 'http://127.0.0.1:5173';
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

function post(body, extras = {}) {
  return handleResearchAgentPost(new Request(`${ORIGIN}/api/research-agent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
    },
    body: JSON.stringify(body),
  }), extras);
}

function openaiProvider(fetchImpl, extras = {}) {
  return createOpenAIProvider({
    apiKey: KEY,
    model: 'gpt-4o-mini',
    max_output_tokens: 400,
    timeout_ms: extras.timeout_ms ?? 15000,
    fetchImpl,
  });
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test('provider config defaults to mock and never exposes secrets', () => {
  const config = loadAgentProviderConfig({});
  assert.equal(config.ok, true);
  assert.equal(config.kind, 'mock');
  assert.equal(config.api_key_present, false);
  assert.equal(publicProviderView(config).configured, true);
  assert.equal(publicProviderView(config).live, false);
  const openaiMissing = loadAgentProviderConfig({ NEUROLENS_AGENT_PROVIDER: 'openai' });
  assert.equal(openaiMissing.ok, false);
  assert.match(openaiMissing.error, /OPENAI_API_KEY/);
  assert.equal(JSON.stringify(publicProviderView(openaiMissing)).includes('sk-'), false);
  const openai = loadAgentProviderConfig({
    NEUROLENS_AGENT_PROVIDER: 'openai',
    OPENAI_API_KEY: KEY,
    NEUROLENS_AGENT_MODEL: 'gpt-4o-mini',
  });
  assert.equal(openai.ok, true);
  assert.equal(openai.api_key_present, true);
  assert.equal(openai.allow_live, false);
  assert.equal(publicProviderView(openai).live, false);
  assert.equal(assertNoSecretLeak(publicProviderView(openai)), true);
  assert.throws(
    () => createConfiguredProvider(openaiMissing),
    (error) => error instanceof ProviderError,
  );
  assert.throws(
    () => createConfiguredProvider(openai),
    (error) => error instanceof ProviderError && /ALLOW_LIVE/.test(error.message),
  );
  const liveView = publicProviderView({ ...openai, allow_live: true });
  assert.equal(liveView.live, true);
  assert.equal(assertNoSecretLeak(liveView), true);
});

test('unknown provider kind and invalid limits fail closed', () => {
  const kind = loadAgentProviderConfig({ NEUROLENS_AGENT_PROVIDER: 'anthropic' });
  assert.equal(kind.ok, false);
  const timeout = loadAgentProviderConfig({ NEUROLENS_AGENT_TIMEOUT_MS: 'nope' });
  assert.equal(timeout.ok, false);
  const budget = loadEvalBudget({ NEUROLENS_AGENT_MAX_CASES: '2', NEUROLENS_AGENT_MAX_REQUESTS: '1' });
  assert.equal(budget.ok, true);
  assert.equal(budget.max_cases, 2);
  const badBudget = loadEvalBudget({ NEUROLENS_AGENT_MAX_CASES: 'nope' });
  assert.equal(badBudget.ok, false);
});

test('OpenAI adapter maps official Chat Completions contract failures', async () => {
  const valid = openaiProvider(async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(init.headers['Content-Type'], 'application/json');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.temperature, 0);
    assert.equal(body.max_completion_tokens, 400);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.max_tokens, undefined);
    return jsonResponse(200, {
      choices: [{ message: { content: '{"status":"answered"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    });
  });
  const completion = await valid.complete({ system: 'sys', user: 'user' });
  assert.equal(completion.text, '{"status":"answered"}');
  assert.equal(completion.finish_reason, 'stop');
  assert.equal(completion.usage.input_tokens, 11);
  assert.equal(completion.usage.output_tokens, 7);
  assert.equal(JSON.stringify(completion).includes(KEY), false);

  const altUsage = openaiProvider(async () => jsonResponse(200, {
    choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
    usage: { input_tokens: 4, output_tokens: 2 },
  }));
  const alt = await altUsage.complete({ system: 's', user: 'u' });
  assert.equal(alt.usage.input_tokens, 4);
  assert.equal(alt.usage.output_tokens, 2);

  const invalidJson = openaiProvider(async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new Error('no json'); },
  }));
  await assert.rejects(() => invalidJson.complete({ system: 's', user: 'u' }), /non-JSON/i);

  for (const [status, pattern] of [
    [401, /credentials/],
    [429, /rate-limited/],
    [500, /unavailable/],
  ]) {
    const failing = openaiProvider(async () => jsonResponse(status, { error: { message: KEY } }));
    await assert.rejects(
      () => failing.complete({ system: 's', user: 'u' }),
      (error) => {
        assert.equal(error.reason_code, REASON_CODES.PROVIDER_UNAVAILABLE);
        assert.match(error.message, pattern);
        assert.equal(String(error.message).includes(KEY), false);
        return true;
      },
    );
  }

  const network = openaiProvider(async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(
    () => network.complete({ system: 's', user: 'u' }),
    (error) => error.reason_code === REASON_CODES.PROVIDER_UNAVAILABLE && !String(error.message).includes(KEY),
  );

  const timeout = openaiProvider(() => new Promise((_, reject) => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    reject(error);
  }), { timeout_ms: 20 });
  await assert.rejects(
    () => timeout.complete({ system: 's', user: 'u' }),
    (error) => error.reason_code === REASON_CODES.PROVIDER_TIMEOUT,
  );

  const empty = openaiProvider(async () => jsonResponse(200, {
    choices: [{ message: { content: '   ' }, finish_reason: 'stop' }],
  }));
  await assert.rejects(() => empty.complete({ system: 's', user: 'u' }), /empty/i);

  const truncated = openaiProvider(async () => jsonResponse(200, {
    choices: [{ message: { content: '{"status":"answ' }, finish_reason: 'length' }],
  }));
  await assert.rejects(() => truncated.complete({ system: 's', user: 'u' }), /truncated/i);

  const filtered = openaiProvider(async () => jsonResponse(200, {
    choices: [{ message: { content: '{"status":"answered"}' }, finish_reason: 'content_filter' }],
  }));
  await assert.rejects(() => filtered.complete({ system: 's', user: 'u' }), /blocked/i);

  const unexpected = openaiProvider(async () => jsonResponse(200, { id: 'cmpl', object: 'chat.completion' }));
  await assert.rejects(() => unexpected.complete({ system: 's', user: 'u' }), /unexpected response schema/i);
});

test('HTTP API keeps client provider selection and credentials out', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const payload = buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'llm:http-valid',
    });
    const catalog = await handleResearchAgentGet({ env: {} }).json();
    assert.equal(catalog.provider.kind, 'mock');
    const ok = await (await post(payload)).json();
    assert.equal(ok.answer.status, 'answered');
    assert.equal(assertNoSecretLeak(ok), true);
    const hijack = await post({ ...payload, provider: 'openai', api_key: KEY });
    assert.equal(hijack.status, 400);
    const missing = await handleResearchAgentPost(new Request(`${ORIGIN}/api/research-agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(payload),
    }), { env: { NEUROLENS_AGENT_PROVIDER: 'openai' } });
    assert.equal(missing.status, 503);
    const body = await missing.json();
    assert.equal(body.ok, false);
    assert.equal(JSON.stringify(body).includes(KEY), false);
    assert.equal(fetchCalls(), 0);
  });
});

test('HTTP openai provider stays disabled without ALLOW_LIVE', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const payload = buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'llm:http-live-gate',
    });
    const env = {
      NEUROLENS_AGENT_PROVIDER: 'openai',
      OPENAI_API_KEY: KEY,
    };
    const blocked = await post(payload, { env });
    assert.equal(blocked.status, 503);
    const body = await blocked.json();
    assert.match(body.error, /ALLOW_LIVE/);
    assert.equal(JSON.stringify(body).includes(KEY), false);
    assert.equal(fetchCalls(), 0);
  });
});

test('mock LLM evaluation suite is deterministic and offline', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const listed = listLlmEvalCases();
    assert.equal(listed.length, 22);
    assert.deepEqual(new Set(listed.map((item) => item.group)).size, 6);
    assert.equal(listed.filter((item) => item.live_eligible).length, 12);
    assert.equal(listed.find((item) => item.id === 'llm-injection-in-evidence').live_mode, 'safety');
    assert.equal(listed.find((item) => item.id === 'llm-fabricated-value').live_mode, 'skip');
    const report = await runLlmEvalSuite({
      env: {},
      now: '2026-10-19T06:00:00.000Z',
      run_id: 'llm-eval:test',
    });
    assert.equal(report.report_version, LLM_EVAL_REPORT_VERSION);
    assert.equal(report.status, 'completed');
    assert.equal(report.live, false);
    assert.equal(report.live_evaluation, 'NOT_RUN');
    assert.equal(report.counts.attempted, 22);
    assert.equal(report.counts.status.PASS, 22);
    assert.equal(report.counts.status.FAIL, 0);
    assert.equal(report.counts.status.SKIPPED, 0);
    assert.equal(report.counts.status.PROVIDER_ERROR, 0);
    assert.equal(report.counts.status.NOT_RUN, 0);
    assert.equal(report.metrics.end_to_end_validated_success_rate.value, 1);
    assert.equal(report.metrics.valid_grounded_answer_rate.denominator, 4);
    assert.equal(report.metrics.correct_runtime_skip_rate.denominator, 6);
    assert.equal(report.metrics.correct_validator_abstention_rate.denominator, 11);
    assert.equal(report.metrics.numeric_fidelity_rate.denominator, 16);
    assert.equal(report.metrics.numeric_fidelity_rate.value, 1);
    assert.equal(report.metrics.citation_accuracy_rate.denominator, 9);
    assert.equal(report.metrics.provider_error_rate.numerator, 0);
    assert.equal(report.cases.every((row) => row.case_status === CASE_STATUS.PASS), true);
    assert.equal(JSON.stringify(report).includes('You are a read-only'), false);
    assert.equal(JSON.stringify(report).includes(KEY), false);
    const summary = formatLlmEvalSummary(report);
    assert.match(summary, /end_to_end_validated_success_rate: 1/);
    assert.match(summary, /case_status PASS 22/);
    assert.equal(fetchCalls(), 0);
  });
});

test('live evaluation without opt-in or key is NOT RUN', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const blocked = await runLlmEvalSuite({ live: true, env: {}, now: '2026-10-19T06:00:00.000Z' });
    assert.equal(blocked.status, 'not_run');
    assert.equal(blocked.live_evaluation, 'NOT_RUN');
    const noKey = await runLlmEvalSuite({
      live: true,
      env: { NEUROLENS_AGENT_ALLOW_LIVE: '1', NEUROLENS_AGENT_PROVIDER: 'openai' },
      now: '2026-10-19T06:00:00.000Z',
    });
    assert.equal(noKey.status, 'not_run');
    assert.match(noKey.reason, /OPENAI_API_KEY/);
    const badBudget = await runLlmEvalSuite({
      env: { NEUROLENS_AGENT_MAX_CASES: 'nope' },
      now: '2026-10-19T06:00:00.000Z',
    });
    assert.equal(badBudget.status, 'not_run');
    assert.match(badBudget.reason, /MAX_CASES/);
    assert.equal(fetchCalls(), 0);
  });
});

test('evaluation stops at the configured request cap and marks remaining NOT_RUN', async () => {
  await withoutNetwork(async () => {
    const report = await runLlmEvalSuite({
      env: { NEUROLENS_AGENT_MAX_CASES: '8', NEUROLENS_AGENT_MAX_REQUESTS: '1' },
      now: '2026-10-19T06:00:00.000Z',
    });
    assert.equal(report.status, 'stopped');
    assert.equal(report.reason, 'max_requests');
    assert.equal(report.counts.attempted, 1);
    assert.equal(report.counts.skipped, 7);
    assert.equal(report.counts.status.PASS, 1);
    assert.equal(report.counts.status.NOT_RUN, 7);
    assert.equal(report.counts.provider_invocations, 1);
    assert.equal(report.metrics.end_to_end_validated_success_rate.denominator, 1);
  });
});

test('missing provider usage stops an estimate-only cost cap', async () => {
  await withoutNetwork(async () => {
    const report = await runLlmEvalSuite({
      env: {
        NEUROLENS_AGENT_MAX_CASES: '6',
        NEUROLENS_AGENT_PRICE_INPUT_PER_1K: '0.15',
        NEUROLENS_AGENT_PRICE_OUTPUT_PER_1K: '0.6',
        NEUROLENS_AGENT_MAX_COST_USD: '0.01',
      },
      now: '2026-10-19T06:00:00.000Z',
    });
    assert.equal(report.status, 'stopped');
    assert.equal(report.reason, 'missing_usage');
    assert.equal(report.counts.provider_invocations, 1);
    assert.equal(report.counts.status.NOT_RUN, 5);
    assert.match(report.limitations.join(' '), /not a guaranteed spending ceiling/);
    assert.equal(estimateCostUsd(null, { pricing_configured: true, price_input_per_1k: 1, price_output_per_1k: 1 }), null);
    assert.equal(estimateCostUsd({ input_tokens: 1000, output_tokens: 1000 }, {
      pricing_configured: true,
      price_input_per_1k: 1,
      price_output_per_1k: 2,
    }), 3);
  });
});

test('budget exhaustion after known usage is an estimate-only stop', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const gold = composeAnswer(
      { kind: 'report_metric', session_ref: 'fixture:session:a', metric_id: 'reaction_time_median_ms' },
      createAnalysisTools({ store: createFixtureStore() }),
    );
    const report = await runLlmEvalSuite({
      live: true,
      env: {
        NEUROLENS_AGENT_ALLOW_LIVE: '1',
        NEUROLENS_AGENT_PROVIDER: 'openai',
        OPENAI_API_KEY: KEY,
        NEUROLENS_AGENT_MAX_CASES: '5',
        NEUROLENS_AGENT_PRICE_INPUT_PER_1K: '1',
        NEUROLENS_AGENT_PRICE_OUTPUT_PER_1K: '1',
        NEUROLENS_AGENT_MAX_COST_USD: '0.02',
      },
      now: '2026-10-19T06:00:00.000Z',
      fetchImpl: async () => jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify(gold) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }),
    });
    assert.equal(report.status, 'stopped');
    assert.equal(report.reason, 'max_cost_usd');
    assert.equal(report.live_evaluation, 'RUN');
    assert.equal(report.counts.provider_invocations, 1);
    assert.ok(report.estimated_cost_usd >= 0.02);
    assert.equal(report.cases.filter((row) => row.case_status === CASE_STATUS.NOT_RUN).length >= 1, true);
    assert.equal(JSON.stringify(report).includes(KEY), false);
    assert.equal(fetchCalls(), 0);
  });
});

test('live scoring skips scripted adversarial cases and does not expect planted 999', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const gold = composeAnswer(
      { kind: 'report_metric', session_ref: 'fixture:session:a', metric_id: 'reaction_time_median_ms' },
      createAnalysisTools({ store: createFixtureStore() }),
    );
    const report = await runLlmEvalSuite({
      live: true,
      env: {
        NEUROLENS_AGENT_ALLOW_LIVE: '1',
        NEUROLENS_AGENT_PROVIDER: 'openai',
        OPENAI_API_KEY: KEY,
        NEUROLENS_AGENT_MAX_REQUESTS: '22',
      },
      now: '2026-10-19T06:00:00.000Z',
      fetchImpl: async () => jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify(gold) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 8, completion_tokens: 6 },
      }),
    });
    assert.equal(report.live_evaluation, 'RUN');
    const fabricated = report.cases.find((row) => row.id === 'llm-fabricated-value');
    assert.equal(fabricated.case_status, CASE_STATUS.SKIPPED);
    const injection = report.cases.find((row) => row.id === 'llm-injection-in-evidence');
    assert.equal(injection.case_status, CASE_STATUS.PASS);
    assert.equal(report.cases.some((row) => row.expected?.model_behavior === 'fabricated_value' && row.case_status === CASE_STATUS.FAIL), false);
    assert.equal(fetchCalls(), 0);
  });
});

test('evaluation metrics omit n/a, skipped, and unrun rows from denominators', () => {
  const metrics = computeLlmEvalMetrics([
    {
      group: 'A_valid_grounded',
      case_status: CASE_STATUS.PASS,
      expected: { layer: 'model_success', abstention_correct: false },
      actual: { answer_status: 'answered', provider_invoked: true },
      scores: { e2e_match: true, numeric_applicable: true, numeric_fidelity: true, citation_applicable: true, citation_correct: true, abstention_correct: true },
    },
    {
      group: 'B_evidence_quality',
      case_status: CASE_STATUS.PASS,
      expected: { layer: 'runtime_fail_closed', abstention_correct: true },
      actual: { answer_status: 'abstained', provider_invoked: false },
      scores: { e2e_match: true, numeric_applicable: false, numeric_fidelity: null, citation_applicable: false, citation_correct: null, abstention_correct: true },
    },
    {
      group: 'C_numeric_fidelity',
      case_status: CASE_STATUS.SKIPPED,
      expected: { layer: 'validator_reject', abstention_correct: true },
      actual: null,
      scores: { e2e_match: null, numeric_applicable: false, numeric_fidelity: true, citation_applicable: false, citation_correct: null, abstention_correct: null },
    },
    {
      group: 'A_valid_grounded',
      case_status: CASE_STATUS.NOT_RUN,
      expected: { layer: 'model_success' },
      actual: null,
      scores: { e2e_match: null, numeric_applicable: false, numeric_fidelity: true },
    },
    {
      group: 'A_valid_grounded',
      case_status: CASE_STATUS.PROVIDER_ERROR,
      expected: { layer: 'model_success' },
      actual: { answer_status: 'abstained', provider_invoked: true },
      scores: { e2e_match: false, numeric_applicable: true, numeric_fidelity: true, citation_applicable: false, citation_correct: null, abstention_correct: false },
    },
  ]);
  assert.equal(metrics.valid_grounded_answer_rate.numerator, 1);
  assert.equal(metrics.valid_grounded_answer_rate.denominator, 2);
  assert.equal(metrics.correct_runtime_skip_rate.numerator, 1);
  assert.equal(metrics.correct_runtime_skip_rate.denominator, 1);
  assert.equal(metrics.numeric_fidelity_rate.denominator, 2);
  assert.equal(metrics.end_to_end_validated_success_rate.numerator, 2);
  assert.equal(metrics.end_to_end_validated_success_rate.denominator, 3);
  assert.equal(metrics.provider_error_rate.numerator, 1);
  assert.equal(metrics.provider_error_rate.denominator, 2);
});
