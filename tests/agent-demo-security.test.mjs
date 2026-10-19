import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider } from '../analysis/src/neurolens/runtime/provider.mjs';
import {
  AUTH_FAILED_ERROR,
  AUTH_REQUIRED_ERROR,
  CONFIG_ERROR,
  DEMO_COOKIE_NAME,
  RATE_LIMITED_ERROR,
  assertNoSecretLeak,
  buildClientPayload,
  createTestSecurity,
  handleDemoSessionDelete,
  handleDemoSessionGet,
  handleDemoSessionPost,
  handleResearchAgentGet,
  handleResearchAgentPost,
  loadDemoSecurityConfig,
  viewFromHttp,
} from '../analysis/src/neurolens/runtime/index.mjs';

const ORIGIN = 'http://127.0.0.1:5173';
const PASSWORD = 'public-demo-password-1';

function payload(request_id = 'sec:rt') {
  return buildClientPayload({
    session_ref: 'fixture:session:a',
    question_id: 'rt-median',
    request_id,
  });
}

function cookieFrom(response) {
  const header = response.headers.get('set-cookie') ?? '';
  const match = header.match(new RegExp(`${DEMO_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

async function read(response) {
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
    cookie: cookieFrom(response),
  };
}

function loginRequest(password = PASSWORD, extras = {}) {
  const url = extras.url ?? `${ORIGIN}/api/research-agent/session`;
  const headers = {
    'content-type': extras.contentType ?? 'application/json',
    ...(extras.origin === null ? {} : { origin: extras.origin ?? ORIGIN }),
    ...(extras.cookie ? { cookie: extras.cookie } : {}),
    ...(extras.ip ? { 'cf-connecting-ip': extras.ip } : {}),
    ...(extras.forwarded ? { 'x-forwarded-for': extras.forwarded } : {}),
  };
  const init = {
    method: extras.method ?? 'POST',
    headers,
  };
  if (extras.body !== null && extras.method !== 'DELETE') {
    init.body = extras.body === undefined ? JSON.stringify({ password }) : extras.body;
  }
  return new Request(url, init);
}

function askRequest(body, extras = {}) {
  const headers = {
    'content-type': 'application/json',
    ...(extras.origin === null ? {} : { origin: extras.origin ?? ORIGIN }),
    ...(extras.cookie ? { cookie: extras.cookie } : {}),
    ...(extras.ip ? { 'cf-connecting-ip': extras.ip } : {}),
    ...(extras.forwarded ? { 'x-forwarded-for': extras.forwarded } : {}),
  };
  return new Request(`${ORIGIN}/api/research-agent`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function signIn(security, extras = {}) {
  return read(await handleDemoSessionPost(loginRequest(PASSWORD, extras), security));
}

test('public deployment fails closed without secrets or when openai is selected', () => {
  const missing = loadDemoSecurityConfig({ NEUROLENS_DEMO_DEPLOYMENT: 'public' });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /PASSWORD/);
  const live = loadDemoSecurityConfig({
    NEUROLENS_DEMO_DEPLOYMENT: 'public',
    NEUROLENS_DEMO_PASSWORD: PASSWORD,
    NEUROLENS_DEMO_SESSION_SECRET: 'demo-session-secret-32-chars-min',
    NEUROLENS_DEMO_RATE_SECRET: 'demo-rate-secret-16',
    NEUROLENS_AGENT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test-not-used',
    NEUROLENS_AGENT_ALLOW_LIVE: '1',
  });
  assert.equal(live.ok, false);
  assert.match(live.error, /mock provider/);
});

test('unauthenticated API access is denied and does not invoke the provider', async () => {
  const security = createTestSecurity();
  const provider = createMockProvider({
    response: { status: 'answered', claims: [], limitations: [] },
  });
  const catalog = await read(await handleResearchAgentGet({
    ...security,
    request: new Request(`${ORIGIN}/api/research-agent`),
  }));
  assert.equal(catalog.status, 401);
  assert.equal(catalog.body.error, AUTH_REQUIRED_ERROR);
  const asked = await read(await handleResearchAgentPost(askRequest(payload()), {
    ...security,
    provider,
  }));
  assert.equal(asked.status, 401);
  assert.equal(asked.body.error, AUTH_REQUIRED_ERROR);
  assert.equal(provider.completeCount(), 0);
  assert.equal(assertNoSecretLeak(asked.body), true);
});

test('authenticated API access can read the catalog and a fixture answer', async () => {
  const security = createTestSecurity();
  const login = await signIn(security);
  assert.equal(login.status, 200);
  assert.equal(login.body.authenticated, true);
  assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/);
  assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Lax/);
  assert.match(login.headers.get('set-cookie') ?? '', /Secure/);
  assert.doesNotMatch(login.headers.get('set-cookie') ?? '', /Path=\/[^a]/);
  const cookie = `${DEMO_COOKIE_NAME}=${login.cookie}`;
  const catalog = await read(await handleResearchAgentGet({
    ...security,
    request: new Request(`${ORIGIN}/api/research-agent`, { headers: { cookie } }),
  }));
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.authenticated, true);
  const asked = await read(await handleResearchAgentPost(askRequest(payload(), { cookie }), security));
  assert.equal(asked.status, 200);
  assert.equal(asked.body.answer.status, 'answered');
  assert.equal(asked.body.answer.claims[0].value, 320);
});

test('invalid and expired sessions are rejected with the same client error', async () => {
  const nowValue = { now: 1_700_000_000_000 };
  const security = createTestSecurity({ now: () => nowValue.now });
  const login = await signIn(security);
  const cookie = `${DEMO_COOKIE_NAME}=${login.cookie}`;
  const invalid = await read(await handleResearchAgentPost(
    askRequest(payload('sec:invalid'), { cookie: `${DEMO_COOKIE_NAME}=not-a-session` }),
    security,
  ));
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error, AUTH_REQUIRED_ERROR);
  nowValue.now += 30_000_000;
  const expired = await read(await handleResearchAgentPost(
    askRequest(payload('sec:expired'), { cookie }),
    security,
  ));
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error, AUTH_REQUIRED_ERROR);
});

test('logout invalidates the server-side session', async () => {
  const security = createTestSecurity();
  const login = await signIn(security);
  const cookie = `${DEMO_COOKIE_NAME}=${login.cookie}`;
  const before = await read(await handleResearchAgentPost(askRequest(payload('sec:before-logout'), { cookie }), security));
  assert.equal(before.status, 200);
  const logout = await read(await handleDemoSessionDelete(loginRequest(PASSWORD, {
    method: 'DELETE',
    cookie,
    body: null,
  }), security));
  assert.equal(logout.status, 200);
  assert.equal(logout.body.authenticated, false);
  const after = await read(await handleResearchAgentPost(askRequest(payload('sec:after-logout'), { cookie }), security));
  assert.equal(after.status, 401);
});

test('authenticated callers still cannot cross the fixture allowlist', async () => {
  const security = createTestSecurity();
  const login = await signIn(security);
  const cookie = `${DEMO_COOKIE_NAME}=${login.cookie}`;
  const hidden = await read(await handleResearchAgentPost(askRequest({
    question: 'What is the median reaction time for a hidden session?',
    intent: { kind: 'report_metric', session_ref: 'fixture:session:hidden', metric_id: 'reaction_time_median_ms' },
    session_scope: ['fixture:session:hidden'],
  }, { cookie }), security));
  assert.equal(hidden.status, 403);
  assert.doesNotMatch(JSON.stringify(hidden.body), /fixture:session:a/);
});

test('direct API requests cannot bypass the UI or CSRF origin check', async () => {
  const security = createTestSecurity();
  const login = await signIn(security);
  const cookie = `${DEMO_COOKIE_NAME}=${login.cookie}`;
  const cross = await read(await handleResearchAgentPost(
    askRequest(payload('sec:csrf'), { cookie, origin: 'https://evil.example' }),
    security,
  ));
  assert.equal(cross.status, 403);
  const loginCross = await read(await handleDemoSessionPost(loginRequest(PASSWORD, { origin: 'https://evil.example' }), security));
  assert.equal(loginCross.status, 403);
  const loginQuery = await read(await handleDemoSessionPost(loginRequest(PASSWORD, {
    url: `${ORIGIN}/api/research-agent/session?password=${PASSWORD}`,
  }), security));
  assert.equal(loginQuery.status, 400);
  assert.equal(loginQuery.body.error, AUTH_FAILED_ERROR);
});

test('rate limits reject extra requests and reset with the window', async () => {
  const nowValue = { now: 5_000 };
  const security = createTestSecurity({
    now: () => nowValue.now,
    env: { NEUROLENS_DEMO_RATE_LIMIT: '2', NEUROLENS_DEMO_RATE_WINDOW_MS: '1000' },
  });
  const login = await signIn(security);
  const cookie = `${DEMO_COOKIE_NAME}=${login.cookie}`;
  const first = await read(await handleResearchAgentPost(askRequest(payload('sec:rl-1'), { cookie }), security));
  const second = await read(await handleResearchAgentPost(askRequest(payload('sec:rl-2'), { cookie }), security));
  const third = await read(await handleResearchAgentPost(askRequest(payload('sec:rl-3'), { cookie }), security));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.equal(third.body.error, RATE_LIMITED_ERROR);
  assert.ok(third.headers.get('retry-after'));
  nowValue.now += 1000;
  const afterWindow = await read(await handleResearchAgentPost(askRequest(payload('sec:rl-4'), { cookie }), security));
  assert.equal(afterWindow.status, 200);
});

test('rate limits are per session and concurrent increments are counted', async () => {
  const security = createTestSecurity({
    env: { NEUROLENS_DEMO_RATE_LIMIT: '2', NEUROLENS_DEMO_RATE_WINDOW_MS: '60000' },
  });
  const firstLogin = await signIn(security);
  const secondLogin = await signIn(security);
  const cookieA = `${DEMO_COOKIE_NAME}=${firstLogin.cookie}`;
  const cookieB = `${DEMO_COOKIE_NAME}=${secondLogin.cookie}`;
  const userB = await read(await handleResearchAgentPost(askRequest(payload('sec:user-b'), { cookie: cookieB }), security));
  assert.equal(userB.status, 200);
  const concurrent = await Promise.all([
    handleResearchAgentPost(askRequest(payload('sec:c1'), { cookie: cookieA }), security),
    handleResearchAgentPost(askRequest(payload('sec:c2'), { cookie: cookieA }), security),
    handleResearchAgentPost(askRequest(payload('sec:c3'), { cookie: cookieA }), security),
  ]);
  const statuses = (await Promise.all(concurrent.map((response) => read(response)))).map((item) => item.status);
  assert.equal(statuses.filter((status) => status === 200).length, 2);
  assert.equal(statuses.filter((status) => status === 429).length, 1);
  const stillB = await read(await handleResearchAgentPost(askRequest(payload('sec:user-b2'), { cookie: cookieB }), security));
  assert.equal(stillB.status, 200);
});

test('missing identity is 401 and spoofed proxy headers do not create a bypass', async () => {
  const security = createTestSecurity({
    env: { NEUROLENS_DEMO_RATE_LIMIT: '1', NEUROLENS_DEMO_RATE_WINDOW_MS: '60000' },
  });
  const missing = await read(await handleResearchAgentPost(askRequest(payload('sec:noid')), security));
  assert.equal(missing.status, 401);
  const login = await signIn(security);
  const cookie = `${DEMO_COOKIE_NAME}=${login.cookie}`;
  const first = await read(await handleResearchAgentPost(
    askRequest(payload('sec:ip-1'), { cookie, ip: '1.1.1.1', forwarded: '8.8.8.8' }),
    security,
  ));
  const spoofed = await read(await handleResearchAgentPost(
    askRequest(payload('sec:ip-2'), { cookie, ip: '9.9.9.9', forwarded: '4.4.4.4' }),
    security,
  ));
  assert.equal(first.status, 200);
  assert.equal(spoofed.status, 429);
});

test('trusted cf-connecting-ip can add an IP cap; X-Forwarded-For is ignored', async () => {
  const security = createTestSecurity({
    env: {
      NEUROLENS_DEMO_RATE_LIMIT: '1',
      NEUROLENS_DEMO_RATE_WINDOW_MS: '60000',
      NEUROLENS_DEMO_TRUST_CF_IP: '1',
    },
  });
  const firstLogin = await signIn(security);
  const secondLogin = await signIn(security);
  const cookieA = `${DEMO_COOKIE_NAME}=${firstLogin.cookie}`;
  const cookieB = `${DEMO_COOKIE_NAME}=${secondLogin.cookie}`;
  const a = await read(await handleResearchAgentPost(
    askRequest(payload('sec:trust-a'), { cookie: cookieA, ip: '203.0.113.8', forwarded: '198.51.100.2' }),
    security,
  ));
  const b = await read(await handleResearchAgentPost(
    askRequest(payload('sec:trust-b'), { cookie: cookieB, ip: '203.0.113.8', forwarded: '198.51.100.9' }),
    security,
  ));
  assert.equal(a.status, 200);
  assert.equal(b.status, 429);
});

test('logs and responses do not leak secrets or fixture questions by default', async () => {
  const security = createTestSecurity();
  const login = await signIn(security);
  assert.equal(assertNoSecretLeak(login.body), true);
  assert.doesNotMatch(JSON.stringify(login.body), new RegExp(PASSWORD));
  assert.doesNotMatch(JSON.stringify(security.logs), new RegExp(PASSWORD));
  assert.doesNotMatch(JSON.stringify(security.logs), /nl_demo=/);
  assert.doesNotMatch(JSON.stringify(security.logs), /What is the median/);
});

test('misconfigured public environments and missing shared stores fail closed', async () => {
  const broken = createTestSecurity({
    env: { NEUROLENS_DEMO_DEPLOYMENT: 'public', NEUROLENS_DEMO_PASSWORD: '' },
  });
  const response = await read(await handleResearchAgentGet({
    ...broken,
    request: new Request(`${ORIGIN}/api/research-agent`),
  }));
  assert.equal(response.status, 503);
  assert.equal(response.body.error, CONFIG_ERROR);
  const noShared = createTestSecurity({ allowMemoryLimiter: false });
  const denied = await read(await handleResearchAgentGet({
    ...noShared,
    sharedStore: false,
    request: new Request(`${ORIGIN}/api/research-agent`),
  }));
  assert.equal(denied.status, 503);
});

test('rate-limit and auth rejection happen before the provider is invoked', async () => {
  const security = createTestSecurity({
    env: { NEUROLENS_DEMO_RATE_LIMIT: '1', NEUROLENS_DEMO_RATE_WINDOW_MS: '60000' },
  });
  const provider = createMockProvider({
    response: {
      answer_version: 'agent-answer/0.1',
      status: 'answered',
      claims: [],
      limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
    },
  });
  const login = await signIn(security);
  const cookie = `${DEMO_COOKIE_NAME}=${login.cookie}`;
  const first = await read(await handleResearchAgentPost(
    askRequest(payload('sec:prov-1'), { cookie }),
    { ...security, provider },
  ));
  const limited = await read(await handleResearchAgentPost(
    askRequest(payload('sec:prov-2'), { cookie }),
    { ...security, provider },
  ));
  assert.equal(first.status, 200);
  assert.equal(limited.status, 429);
  assert.equal(provider.completeCount(), 1);
});

test('session status and view-model stay generic for auth failures', async () => {
  const security = createTestSecurity();
  const status = await read(await handleDemoSessionGet(new Request(`${ORIGIN}/api/research-agent/session`), security));
  assert.equal(status.status, 200);
  assert.equal(status.body.authenticated, false);
  assert.equal(viewFromHttp({ httpStatus: 401, body: { error: AUTH_REQUIRED_ERROR } }).kind, 'unauthenticated');
  assert.equal(assertNoSecretLeak(status.body), true);
});
