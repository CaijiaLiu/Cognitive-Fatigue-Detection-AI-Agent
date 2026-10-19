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
import { LLM_EVAL_REPORT_VERSION } from '../analysis/src/neurolens/eval/llm-report.mjs';
import { buildClientPayload } from '../analysis/src/neurolens/runtime/demo-ui.mjs';

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

test('provider config defaults to mock and never exposes secrets', () => {
  const config = loadAgentProviderConfig({});
  assert.equal(config.ok, true);
  assert.equal(config.kind, 'mock');
  assert.equal(config.api_key_present, false);
  assert.equal(publicProviderView(config).configured, true);
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
  assert.equal(assertNoSecretLeak(publicProviderView(openai)), true);
  assert.throws(
    () => createConfiguredProvider(openaiMissing),
    (error) => error instanceof ProviderError,
  );
});

test('unknown provider kind and invalid limits fail closed', () => {
  const kind = loadAgentProviderConfig({ NEUROLENS_AGENT_PROVIDER: 'anthropic' });
  assert.equal(kind.ok, false);
  const timeout = loadAgentProviderConfig({ NEUROLENS_AGENT_TIMEOUT_MS: 'nope' });
  assert.equal(timeout.ok, false);
  const budget = loadEvalBudget({ NEUROLENS_AGENT_MAX_CASES: '2', NEUROLENS_AGENT_MAX_REQUESTS: '1' });
  assert.equal(budget.ok, true);
  assert.equal(budget.max_cases, 2);
});

test('OpenAI adapter maps timeout, unavailable, empty, and invalid envelopes', async () => {
  const timeout = createOpenAIProvider({
    apiKey: KEY,
    timeout_ms: 20,
    fetchImpl: () => new Promise((_, reject) => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }),
  });
  await assert.rejects(
    () => timeout.complete({ system: 's', user: 'u' }),
    (error) => error.reason_code === REASON_CODES.PROVIDER_TIMEOUT,
  );

  const down = createOpenAIProvider({
    apiKey: KEY,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: { message: KEY } }) }),
  });
  await assert.rejects(
    () => down.complete({ system: 's', user: 'u' }),
    (error) => {
      assert.equal(error.reason_code, REASON_CODES.PROVIDER_UNAVAILABLE);
      assert.equal(String(error.message).includes(KEY), false);
      return true;
    },
  );

  const empty = createOpenAIProvider({
    apiKey: KEY,
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) }),
  });
  await assert.rejects(() => empty.complete({ system: 's', user: 'u' }), /empty/i);

  const invalid = createOpenAIProvider({
    apiKey: KEY,
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('no json'); } }),
  });
  await assert.rejects(() => invalid.complete({ system: 's', user: 'u' }), /non-JSON/i);
});

test('OpenAI adapter returns text and usage without leaking the key', async () => {
  const provider = createOpenAIProvider({
    apiKey: KEY,
    model: 'gpt-4o-mini',
    fetchImpl: async (url, init) => {
      assert.match(url, /chat\/completions/);
      assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
      const body = JSON.parse(init.body);
      assert.equal(body.max_tokens, 400);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"status":"answered"}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        }),
      };
    },
  });
  const completion = await provider.complete({ system: 'sys', user: 'user' });
  assert.equal(completion.text, '{"status":"answered"}');
  assert.equal(completion.usage.input_tokens, 11);
  assert.equal(completion.usage.output_tokens, 7);
  assert.equal(JSON.stringify(completion).includes(KEY), false);
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

test('mock LLM evaluation suite is deterministic and offline', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const listed = listLlmEvalCases();
    assert.equal(listed.length, 22);
    assert.deepEqual(new Set(listed.map((item) => item.group)).size, 6);
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
    assert.equal(report.metrics.end_to_end_validated_success_rate.value, 1);
    assert.equal(report.metrics.provider_error_rate.numerator, 0);
    assert.equal(JSON.stringify(report).includes('You are a read-only'), false);
    assert.equal(JSON.stringify(report).includes(KEY), false);
    const summary = formatLlmEvalSummary(report);
    assert.match(summary, /end_to_end_validated_success_rate: 1/);
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
    assert.equal(fetchCalls(), 0);
  });
});

test('evaluation stops at the configured request cap', async () => {
  await withoutNetwork(async () => {
    const report = await runLlmEvalSuite({
      env: { NEUROLENS_AGENT_MAX_CASES: '8', NEUROLENS_AGENT_MAX_REQUESTS: '1' },
      now: '2026-10-19T06:00:00.000Z',
    });
    assert.equal(report.status, 'stopped');
    assert.equal(report.reason, 'max_requests');
    assert.ok(report.counts.attempted < 8);
    assert.equal(report.counts.provider_invocations, 1);
  });
});
