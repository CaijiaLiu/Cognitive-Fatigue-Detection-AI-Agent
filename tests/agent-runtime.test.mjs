import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANSWER_VERSION,
  REASON_CODES,
  composeAnswer,
  createAnalysisTools,
  createFixtureStore,
} from '../analysis/src/neurolens/agent/index.mjs';
import {
  AUDIT_VERSION,
  FAILURE_CLASS,
  RUNTIME_VERSION,
  createMockProvider,
  createResearchAgentRuntime,
  sha256Text,
} from '../analysis/src/neurolens/runtime/index.mjs';

const QUESTION_RT = 'What is the median reaction time for fixture session A?';
const LIMIT = 'Synthetic fixture; not a fatigue diagnosis and not empirical evidence.';

function clock() {
  let t = 1_000;
  return () => {
    t += 17;
    return t;
  };
}

function validAsk(overrides = {}) {
  return {
    request_id: overrides.request_id ?? 'runtime:test-valid',
    question: overrides.question ?? QUESTION_RT,
    intent: overrides.intent ?? {
      kind: 'report_metric',
      session_ref: 'fixture:session:a',
      metric_id: 'reaction_time_median_ms',
    },
    session_scope: overrides.session_scope ?? ['fixture:session:a'],
  };
}

function tools() {
  return createAnalysisTools({ store: createFixtureStore() });
}

function goldFor(agentTools, intent = validAsk().intent) {
  return composeAnswer(intent, agentTools);
}

function runtimeWith(provider, extras = {}) {
  return createResearchAgentRuntime({
    tools: extras.tools ?? tools(),
    provider,
    timeout_ms: extras.timeout_ms ?? 1500,
    clock: extras.clock ?? clock(),
    now: extras.now ?? '2026-10-19T06:00:00.000Z',
  });
}

async function withoutNetwork(fn) {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error('network should not be used'));
  };
  try {
    return await fn(() => fetchCalls);
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
}

test('mock provider is configurable and never reads API keys', async () => {
  const provider = createMockProvider({
    provider_id: 'mock-lab',
    model: 'mock-scripted/0.2',
    response: { hello: true },
  });
  assert.equal(provider.kind, 'mock');
  assert.equal(provider.provider_id, 'mock-lab');
  assert.equal(provider.model, 'mock-scripted/0.2');
  const completion = await provider.complete({ system: 'sys', user: 'user', timeout_ms: 10 });
  assert.equal(completion.text, '{"hello":true}');
  assert.equal(provider.completeCount(), 1);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
});

test('orchestration returns a validated grounded answer from the mock provider', async () => {
  await withoutNetwork(async (fetchCalls) => {
    const agentTools = tools();
    const gold = goldFor(agentTools);
    const provider = createMockProvider({ response: gold });
    const runtime = runtimeWith(provider, { tools: agentTools });
    const result = await runtime.ask(validAsk());
    assert.equal(result.runtime_version, RUNTIME_VERSION);
    assert.equal(result.answer.status, 'answered');
    assert.equal(result.answer.claims[0].value, 320);
    assert.equal(result.answer.claims[0].unit, 'ms');
    assert.deepEqual(result.answer.claims[0].artifact_refs, ['fixture:session-summary:a']);
    assert.equal(result.audit.failure_class, FAILURE_CLASS.NONE);
    assert.equal(result.audit.provider_invoked, true);
    assert.equal(result.audit.validation.ok, true);
    assert.equal(provider.completeCount(), 1);
    assert.equal(fetchCalls(), 0);
  });
});

test('provider timeout fails closed without numeric claims', async () => {
  const provider = createMockProvider({ mode: 'timeout' });
  const result = await runtimeWith(provider).ask(validAsk({ request_id: 'runtime:timeout' }));
  assert.equal(result.answer.status, 'abstained');
  assert.equal(result.answer.reason_code, REASON_CODES.PROVIDER_TIMEOUT);
  assert.deepEqual(result.answer.claims, []);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.PROVIDER);
  assert.equal(result.audit.failure_reason, REASON_CODES.PROVIDER_TIMEOUT);
  assert.equal(result.audit.provider_invoked, true);
  assert.doesNotMatch(JSON.stringify(result.answer), /"value": 320/);
});

test('provider unavailable is distinct from insufficient_data', async () => {
  const provider = createMockProvider({ mode: 'unavailable' });
  const result = await runtimeWith(provider).ask(validAsk({ request_id: 'runtime:unavail' }));
  assert.equal(result.answer.reason_code, REASON_CODES.PROVIDER_UNAVAILABLE);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.PROVIDER);
  assert.notEqual(result.answer.reason_code, REASON_CODES.INSUFFICIENT_DATA);
});

test('malformed provider JSON is discarded', async () => {
  const provider = createMockProvider({ response: '{status:answered' });
  const result = await runtimeWith(provider).ask(validAsk({ request_id: 'runtime:malformed' }));
  assert.equal(result.answer.status, 'abstained');
  assert.equal(result.answer.reason_code, REASON_CODES.MALFORMED_OUTPUT);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.VALIDATION);
  assert.deepEqual(result.answer.claims, []);
});

test('unsupported clinical questions abstain before the provider is called', async () => {
  const provider = createMockProvider({ response: { should_not: 'run' } });
  const result = await runtimeWith(provider).ask({
    request_id: 'runtime:medical',
    question: 'Does this participant have ADHD?',
    intent: { kind: 'clinical_diagnosis', text: 'This participant has ADHD' },
    session_scope: ['fixture:session:a'],
  });
  assert.equal(result.answer.reason_code, REASON_CODES.UNSUPPORTED_CLAIM);
  assert.equal(result.audit.provider_invoked, false);
  assert.equal(provider.completeCount(), 0);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.REQUEST);
});

test('fabricated numeric values are not returned as trusted answers', async () => {
  const drifted = {
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{
      text: 'The fixture reaction_time_median_ms is 999 ms.',
      metric_id: 'reaction_time_median_ms',
      value: 999,
      unit: 'ms',
      artifact_refs: ['fixture:session-summary:a'],
    }],
    limitations: [LIMIT],
  };
  const provider = createMockProvider({ response: drifted });
  const result = await runtimeWith(provider).ask(validAsk({ request_id: 'runtime:drift' }));
  assert.equal(result.answer.status, 'abstained');
  assert.equal(result.answer.reason_code, REASON_CODES.NUMERIC_MISMATCH);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.VALIDATION);
  assert.equal(result.answer.claims.length, 0);
  assert.doesNotMatch(JSON.stringify(result.answer), /999/);
});

test('wrong-session citations fail closed and discard the foreign number', async () => {
  const stolen = {
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{
      text: 'The fixture reaction_time_median_ms is 348 ms.',
      metric_id: 'reaction_time_median_ms',
      value: 348,
      unit: 'ms',
      artifact_refs: ['fixture:session-summary:b'],
    }],
    limitations: [LIMIT],
  };
  const provider = createMockProvider({ response: stolen });
  const result = await runtimeWith(provider).ask(validAsk({
    request_id: 'runtime:cite-b',
    session_scope: ['fixture:session:a', 'fixture:session:b'],
  }));
  assert.ok([REASON_CODES.SESSION_MISMATCH, REASON_CODES.MISSING_EVIDENCE].includes(result.answer.reason_code));
  assert.equal(result.audit.failure_class, FAILURE_CLASS.VALIDATION);
  assert.deepEqual(result.answer.claims, []);
  assert.doesNotMatch(JSON.stringify(result.answer), /348/);
});

test('unknown artifact lookups abstain as evidence errors without calling the provider', async () => {
  const provider = createMockProvider({ response: { should_not: 'run' } });
  const result = await runtimeWith(provider).ask({
    request_id: 'runtime:unknown-art',
    question: 'What is stored in fixture:session-summary:does-not-exist?',
    intent: { kind: 'lookup_artifact', artifact_ref: 'fixture:session-summary:does-not-exist' },
    session_scope: ['fixture:session:a'],
  });
  assert.equal(result.answer.reason_code, REASON_CODES.UNKNOWN_ARTIFACT);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.EVIDENCE);
  assert.equal(result.audit.provider_invoked, false);
  assert.equal(provider.completeCount(), 0);
});

test('missing evidence on a low-quality session skips the provider', async () => {
  const provider = createMockProvider({ response: { should_not: 'run' } });
  const result = await runtimeWith(provider).ask({
    request_id: 'runtime:low-quality',
    question: 'What is the median reaction time for the low-quality fixture session?',
    intent: {
      kind: 'report_metric',
      session_ref: 'fixture:session:low-quality',
      metric_id: 'reaction_time_median_ms',
    },
    session_scope: ['fixture:session:low-quality'],
  });
  assert.equal(result.answer.reason_code, REASON_CODES.INSUFFICIENT_DATA);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.EVIDENCE);
  assert.equal(provider.completeCount(), 0);
});

test('incompatible protocol comparisons abstain without a provider call', async () => {
  const provider = createMockProvider({ response: { should_not: 'run' } });
  const result = await runtimeWith(provider).ask({
    request_id: 'runtime:protocol',
    question: 'Compare median reaction time between fixture session A and the other-protocol session.',
    intent: {
      kind: 'compare_metric',
      session_refs: ['fixture:session:a', 'fixture:session:other-protocol'],
      metric_id: 'reaction_time_median_ms',
    },
    session_scope: ['fixture:session:a', 'fixture:session:other-protocol'],
  });
  assert.equal(result.answer.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.EVIDENCE);
  assert.equal(provider.completeCount(), 0);
});

test('audit trail records identity, tools, evidence, and duration without raw prompts', async () => {
  const agentTools = tools();
  const gold = goldFor(agentTools);
  const provider = createMockProvider({ provider_id: 'mock-lab', model: 'mock-scripted/0.2', response: gold });
  const result = await runtimeWith(provider, { tools: agentTools }).ask(validAsk({ request_id: 'runtime:audit' }));
  const audit = result.audit;
  assert.equal(audit.audit_version, AUDIT_VERSION);
  assert.equal(audit.request_id, 'runtime:audit');
  assert.equal(audit.provider_id, 'mock-lab');
  assert.equal(audit.model, 'mock-scripted/0.2');
  assert.equal(audit.question_sha256, sha256Text(QUESTION_RT));
  assert.equal(audit.tool_calls[0].tool, 'get_session_summary');
  assert.equal(audit.tool_calls[0].status, 'ok');
  assert.deepEqual(audit.artifact_refs, ['fixture:session-summary:a']);
  assert.equal(audit.validation.ok, true);
  assert.equal(typeof audit.duration_ms, 'number');
  assert.ok(audit.duration_ms >= 0);
  assert.equal(JSON.stringify(audit).includes(gold.claims[0].text), false);
  assert.equal(JSON.stringify(audit).includes('You are a read-only'), false);
  assert.match(audit.limitations.join(' '), /not a medical or scientific record/);
});

test('the provider cannot expand authorized session scope', async () => {
  const provider = createMockProvider({ response: { should_not: 'run' } });
  const result = await runtimeWith(provider).ask({
    request_id: 'runtime:scope',
    question: QUESTION_RT,
    intent: {
      kind: 'report_metric',
      session_ref: 'fixture:session:b',
      metric_id: 'reaction_time_median_ms',
    },
    session_scope: ['fixture:session:a'],
  });
  assert.equal(result.answer.reason_code, REASON_CODES.REJECTED_REQUEST);
  assert.equal(result.audit.failure_class, FAILURE_CLASS.REQUEST);
  assert.equal(provider.completeCount(), 0);
});

test('paths and extra request fields are rejected before tools run', async () => {
  const provider = createMockProvider({ response: { should_not: 'run' } });
  const runtime = runtimeWith(provider);
  const pathAsk = await runtime.ask({
    request_id: 'runtime:path',
    question: QUESTION_RT,
    intent: {
      kind: 'report_metric',
      session_ref: 'fixture:session:a',
      metric_id: 'reaction_time_median_ms',
      path: '/tmp/export.json',
    },
    session_scope: ['fixture:session:a'],
  });
  assert.equal(pathAsk.answer.reason_code, REASON_CODES.REJECTED_REQUEST);
  const extra = await runtime.ask({
    ...validAsk({ request_id: 'runtime:extra' }),
    file: '../secrets',
  });
  assert.equal(extra.answer.reason_code, REASON_CODES.REJECTED_REQUEST);
  const urlScope = await runtime.ask({
    request_id: 'runtime:url',
    question: QUESTION_RT,
    intent: validAsk().intent,
    session_scope: ['https://example.test/session'],
  });
  assert.equal(urlScope.answer.reason_code, REASON_CODES.REJECTED_REQUEST);
  assert.equal(provider.completeCount(), 0);
});
