import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_REQUIRED_ERROR,
  DEMO_COOKIE_NAME,
  DEMO_COOKIE_PATH,
  DEMO_D1_CLEANUP_SQL,
  DEMO_D1_INCREMENT_SQL,
  assertNoSecretLeak,
  buildClientPayload,
  createSerializedRateLimitStore,
  createTestSecurity,
  demoCookieCoversPath,
  handleDemoSessionPost,
  handleResearchAgentGet,
  handleResearchAgentPost,
  loadDemoSecurityConfig,
  serializeDemoCookie,
} from '../analysis/src/neurolens/runtime/index.mjs';

const ORIGIN = 'http://127.0.0.1:5173';
const PASSWORD = 'public-demo-password-1';
const GATED_SECRETS = {
  NEUROLENS_DEMO_PASSWORD: PASSWORD,
  NEUROLENS_DEMO_SESSION_SECRET: 'demo-session-secret-32-chars-min',
  NEUROLENS_DEMO_RATE_SECRET: 'demo-rate-secret-16',
};

test('preview mode fails closed without isolated D1 acknowledgement or when openai is selected', () => {
  const missing = loadDemoSecurityConfig({
    NEUROLENS_DEMO_DEPLOYMENT: 'preview',
    ...GATED_SECRETS,
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /D1_ISOLATED/);
  const live = loadDemoSecurityConfig({
    NEUROLENS_DEMO_DEPLOYMENT: 'preview',
    ...GATED_SECRETS,
    NEUROLENS_DEMO_D1_ISOLATED: '1',
    NEUROLENS_AGENT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test-not-used',
    NEUROLENS_AGENT_ALLOW_LIVE: '1',
  });
  assert.equal(live.ok, false);
  assert.match(live.error, /mock provider/);
  const ok = loadDemoSecurityConfig({
    NEUROLENS_DEMO_DEPLOYMENT: 'preview',
    ...GATED_SECRETS,
    NEUROLENS_DEMO_D1_ISOLATED: '1',
    NEUROLENS_AGENT_PROVIDER: 'mock',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.auth_required, true);
  assert.equal(ok.provider_kind, 'mock');
  assert.equal(ok.allow_live, false);
  assert.equal(ok.d1_isolated, true);
});

test('demo cookie path covers Research Agent APIs only', () => {
  assert.equal(demoCookieCoversPath('/api/research-agent'), true);
  assert.equal(demoCookieCoversPath('/api/research-agent/session'), true);
  assert.equal(demoCookieCoversPath('/research-agent'), false);
  assert.equal(demoCookieCoversPath('/api/upload-ticket'), false);
  assert.equal(demoCookieCoversPath('/api/research'), false);
  assert.equal(demoCookieCoversPath('/collection/index.html'), false);
  const cookie = serializeDemoCookie('token', { maxAge: 60, secure: true });
  assert.match(cookie, new RegExp(`Path=${DEMO_COOKIE_PATH}`));
  assert.doesNotMatch(cookie, /Path=\/;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
});

test('serialized limiter counts concurrent increments exactly in one process', async () => {
  const store = createSerializedRateLimitStore();
  const now = 10_000;
  const results = await Promise.all(Array.from({ length: 8 }, () => (
    store.increment('same-key', { now, window_ms: 60_000 })
  )));
  const counts = results.map((item) => item.count).sort((a, b) => a - b);
  assert.deepEqual(counts, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(results.every((item) => item.reset_at === now + 60_000), true);
});

test('D1 demo SQL scopes cleanup and increments atomically', () => {
  assert.match(DEMO_D1_CLEANUP_SQL, /demo:sess:%/);
  assert.match(DEMO_D1_CLEANUP_SQL, /demo:rl:%/);
  assert.doesNotMatch(DEMO_D1_CLEANUP_SQL, /DELETE FROM upload_limits WHERE expires < \?$/);
  assert.match(DEMO_D1_INCREMENT_SQL, /count=count\+1/);
  assert.match(DEMO_D1_INCREMENT_SQL, /RETURNING count, expires/);
});

test('request IDs correlate logs without leaking secrets or questions', async () => {
  const security = createTestSecurity({
    env: {
      NEUROLENS_DEMO_DEPLOYMENT: 'preview',
      NEUROLENS_DEMO_D1_ISOLATED: '1',
    },
  });
  const request = new Request(`${ORIGIN}/api/research-agent`, {
    headers: { 'x-request-id': 'preview-corr-001' },
  });
  const response = await handleResearchAgentGet({ ...security, request });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-request-id'), 'preview-corr-001');
  const body = await response.json();
  assert.equal(body.error, AUTH_REQUIRED_ERROR);
  assert.equal(security.logs.some((entry) => entry.request_id === 'preview-corr-001'), true);
  assert.equal(security.logs.every((entry) => entry.endpoint && entry.outcome), true);
  assert.doesNotMatch(JSON.stringify(security.logs), new RegExp(PASSWORD));
  assert.doesNotMatch(JSON.stringify(security.logs), /nl_demo=/);
  assert.doesNotMatch(JSON.stringify(security.logs), /What is the median/);
  assert.equal(assertNoSecretLeak(security.logs), true);
});

test('preview authenticated ask still uses fixtures and refuses client evidence', async () => {
  const security = createTestSecurity({
    env: {
      NEUROLENS_DEMO_DEPLOYMENT: 'preview',
      NEUROLENS_DEMO_D1_ISOLATED: '1',
    },
  });
  const login = await handleDemoSessionPost(new Request(`${ORIGIN}/api/research-agent/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ password: PASSWORD }),
  }), security);
  const cookieHeader = login.headers.get('set-cookie') ?? '';
  const token = decodeURIComponent(cookieHeader.match(new RegExp(`${DEMO_COOKIE_NAME}=([^;]+)`))[1]);
  const cookie = `${DEMO_COOKIE_NAME}=${token}`;
  const ok = await handleResearchAgentPost(new Request(`${ORIGIN}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify(buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'preview:rt',
    })),
  }), security);
  assert.equal(ok.status, 200);
  const evidence = await handleResearchAgentPost(new Request(`${ORIGIN}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify({
      ...buildClientPayload({
        session_ref: 'fixture:session:a',
        question_id: 'rt-median',
        request_id: 'preview:ev',
      }),
      evidence: { metrics: [{ value: 1 }] },
    }),
  }), security);
  assert.equal(evidence.status, 400);
});
