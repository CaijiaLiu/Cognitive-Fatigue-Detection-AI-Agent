import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_VERSION, REASON_CODES } from '../analysis/src/neurolens/agent/constants.mjs';
import { createMockProvider } from '../analysis/src/neurolens/runtime/provider.mjs';
import {
  AGENT_API_VERSION,
  ALLOWED_SESSION_REFS,
  buildClientPayload,
  handleResearchAgentGet,
  handleResearchAgentPost,
  validateAgentHttpBody,
  viewFromHttp,
} from '../analysis/src/neurolens/runtime/index.mjs';

const ORIGIN = 'http://127.0.0.1:5173';

function post(body, extras = {}) {
  const url = extras.url ?? `${ORIGIN}/api/research-agent`;
  const headers = {
    'content-type': extras.contentType ?? 'application/json',
    ...(extras.origin === null ? {} : { origin: extras.origin ?? ORIGIN }),
  };
  return handleResearchAgentPost(new Request(url, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), extras.runtimeOptions ?? {});
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

test('GET catalog lists only the server-side synthetic allowlist', async () => {
  const { status, body } = await read(handleResearchAgentGet());
  assert.equal(status, 200);
  assert.equal(body.api_version, AGENT_API_VERSION);
  assert.equal(body.demo.synthetic, true);
  assert.deepEqual(body.allowed_session_refs, ALLOWED_SESSION_REFS);
  assert.ok(body.sessions.every((item) => item.session_ref.startsWith('fixture:session:')));
});

test('valid request returns a validated fixture answer', async () => {
  const payload = buildClientPayload({
    session_ref: 'fixture:session:a',
    question_id: 'rt-median',
    request_id: 'api:valid-rt',
  });
  const { status, body } = await read(await post(payload));
  assert.equal(status, 200);
  assert.equal(body.answer.status, 'answered');
  assert.equal(body.answer.claims[0].value, 320);
  assert.equal(body.answer.claims[0].unit, 'ms');
  assert.deepEqual(body.audit.artifact_refs, ['fixture:session-summary:a']);
  assert.equal(JSON.stringify(body).includes('You are a read-only'), false);
  assert.equal(JSON.stringify(body).includes('validated evidence'), false);
});

test('invalid request schema is rejected with 400', async () => {
  const { status, body } = await read(await post({ foo: 1 }));
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  const evidence = await read(await post({
    ...buildClientPayload({ session_ref: 'fixture:session:a', question_id: 'rt-median', request_id: 'api:ev' }),
    evidence: { metrics: [{ value: 1 }] },
  }));
  assert.equal(evidence.status, 400);
  assert.match(evidence.body.error, /evidence/i);
});

test('unauthorized sessions are rejected server-side', async () => {
  const checked = validateAgentHttpBody({
    question: 'What is the median reaction time for a hidden session?',
    intent: { kind: 'report_metric', session_ref: 'fixture:session:hidden', metric_id: 'reaction_time_median_ms' },
    session_scope: ['fixture:session:hidden'],
  });
  assert.equal(checked.status, 403);
  const { status, body } = await read(await post({
    question: 'What is the median reaction time?',
    intent: { kind: 'report_metric', session_ref: 'export:session:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', metric_id: 'reaction_time_median_ms' },
    session_scope: ['export:session:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  }));
  assert.equal(status, 403);
  assert.equal(body.ok, false);
  assert.match(body.error, /allowlist/);
});

test('unsupported metrics and unknown intent kinds are rejected', async () => {
  const metric = await read(await post({
    question: 'What is blink count?',
    intent: { kind: 'report_metric', session_ref: 'fixture:session:a', metric_id: 'blink_count' },
    session_scope: ['fixture:session:a'],
  }));
  assert.equal(metric.status, 400);
  assert.equal(metric.body.reason_code, REASON_CODES.UNKNOWN_METRIC);
  const kind = await read(await post({
    question: 'What is the median reaction time?',
    intent: { type: 'session_metric', metric_id: 'reaction_time_median_ms', session_ref: 'fixture:session:a' },
    session_scope: ['fixture:session:a'],
  }));
  assert.equal(kind.status, 400);
});

test('low-quality fixture returns a contract abstention', async () => {
  const { status, body } = await read(await post(buildClientPayload({
    session_ref: 'fixture:session:low-quality',
    question_id: 'rt-median',
    request_id: 'api:low',
  })));
  assert.equal(status, 200);
  assert.equal(body.answer.status, 'abstained');
  assert.equal(body.answer.reason_code, REASON_CODES.INSUFFICIENT_DATA);
  assert.deepEqual(body.answer.claims, []);
});

test('provider timeout and unavailable do not leak numeric claims', async () => {
  const payload = buildClientPayload({
    session_ref: 'fixture:session:a',
    question_id: 'rt-median',
    request_id: 'api:timeout',
  });
  const timeout = await read(await post(payload, {
    runtimeOptions: { provider: createMockProvider({ mode: 'timeout' }) },
  }));
  assert.equal(timeout.status, 503);
  assert.equal(timeout.body.answer.reason_code, REASON_CODES.PROVIDER_TIMEOUT);
  assert.doesNotMatch(JSON.stringify(timeout.body.answer), /320/);
  const down = await read(await post({ ...payload, request_id: 'api:down' }, {
    runtimeOptions: { provider: createMockProvider({ mode: 'unavailable' }) },
  }));
  assert.equal(down.status, 503);
  assert.equal(down.body.answer.reason_code, REASON_CODES.PROVIDER_UNAVAILABLE);
});

test('unvalidated provider output is not returned as an answer', async () => {
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
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  };
  const { status, body } = await read(await post(buildClientPayload({
    session_ref: 'fixture:session:a',
    question_id: 'rt-median',
    request_id: 'api:drift',
  }), { runtimeOptions: { provider: createMockProvider({ response: drifted }) } }));
  assert.equal(status, 200);
  assert.equal(body.answer.status, 'abstained');
  assert.equal(body.answer.reason_code, REASON_CODES.NUMERIC_MISMATCH);
  assert.doesNotMatch(JSON.stringify(body.answer), /999/);
});

test('missing origin, paths, and oversized bodies are rejected', async () => {
  const payload = buildClientPayload({
    session_ref: 'fixture:session:a',
    question_id: 'rt-median',
    request_id: 'api:origin',
  });
  const noOrigin = await read(await post(payload, { origin: null }));
  assert.equal(noOrigin.status, 403);
  const crossOrigin = await read(await post(payload, { origin: 'https://evil.example' }));
  assert.equal(crossOrigin.status, 403);
  const pathIntent = await read(await post({
    question: payload.question,
    intent: { ...payload.intent, path: '/tmp/export.json' },
    session_scope: payload.session_scope,
  }));
  assert.equal(pathIntent.status, 400);
  const huge = await read(await post(`${'{"question":"'.padEnd(9000, 'x')}"}`));
  assert.equal(huge.status, 413);
});

test('demo UI view model covers loading, success, abstention, and error', () => {
  assert.equal(viewFromHttp({ loading: true }).kind, 'loading');
  const success = viewFromHttp({
    httpStatus: 200,
    body: {
      answer: {
        status: 'answered',
        claims: [{ text: 'RT', metric_id: 'reaction_time_median_ms', value: 320, unit: 'ms' }],
        limitations: ['Synthetic fixture'],
      },
      audit: { artifact_refs: ['fixture:session-summary:a'] },
    },
  });
  assert.equal(success.kind, 'success');
  assert.equal(success.claims[0].value, 320);
  const abstained = viewFromHttp({
    httpStatus: 200,
    body: { answer: { status: 'abstained', reason_code: 'insufficient_data', limitations: ['no data'] }, audit: { artifact_refs: [] } },
  });
  assert.equal(abstained.kind, 'abstained');
  assert.equal(viewFromHttp({ httpStatus: 403, body: { error: 'blocked' } }).kind, 'error');
  assert.equal(viewFromHttp({ networkError: 'offline' }).kind, 'error');
  const payload = buildClientPayload({ session_ref: 'fixture:session:a', question_id: 'accuracy' });
  assert.equal(payload.intent.kind, 'report_metric');
  assert.equal(payload.intent.metric_id, 'accuracy');
});
