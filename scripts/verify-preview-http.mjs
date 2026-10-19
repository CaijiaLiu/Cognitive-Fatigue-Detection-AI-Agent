#!/usr/bin/env node
/**
 * HTTP security checks for an authorized Research Agent preview.
 * Offline default talks to in-process handlers. Remote --base is opt-in.
 * Never prints passwords, cookies, or full authenticated headers.
 */
import {
  AUTH_FAILED_ERROR,
  AUTH_REQUIRED_ERROR,
  CONFIG_ERROR,
  RATE_LIMITED_ERROR,
  buildClientPayload,
  createTestSecurity,
  handleDemoSessionDelete,
  handleDemoSessionPost,
  handleResearchAgentGet,
  handleResearchAgentPost,
  loadDemoSecurityConfig,
} from '../analysis/src/neurolens/runtime/index.mjs';

const args = process.argv.slice(2);
const base = argValue('--base');
const offline = args.includes('--offline') || !base;
const origin = base ? new URL(base).origin : 'http://127.0.0.1:5173';

function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function redactHeaders(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) {
    if (/cookie|authorization|set-cookie/i.test(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

function cookieFlags(setCookie) {
  if (!setCookie) return { present: false };
  return {
    present: true,
    httpOnly: /HttpOnly/i.test(setCookie),
    secure: /Secure/i.test(setCookie),
    sameSiteLax: /SameSite=Lax/i.test(setCookie),
    path: /Path=\/api\/research-agent/i.test(setCookie),
  };
}

async function runOffline() {
  const password = process.env.NEUROLENS_DEMO_PASSWORD || 'public-demo-password-1';
  const security = createTestSecurity({
    env: {
      NEUROLENS_DEMO_DEPLOYMENT: 'preview',
      NEUROLENS_DEMO_PASSWORD: password,
      NEUROLENS_DEMO_D1_ISOLATED: '1',
      NEUROLENS_DEMO_RATE_LIMIT: '30',
      NEUROLENS_DEMO_RATE_WINDOW_MS: '60000',
    },
  });
  const tight = createTestSecurity({
    env: {
      NEUROLENS_DEMO_DEPLOYMENT: 'preview',
      NEUROLENS_DEMO_PASSWORD: password,
      NEUROLENS_DEMO_D1_ISOLATED: '1',
      NEUROLENS_DEMO_RATE_LIMIT: '1',
      NEUROLENS_DEMO_RATE_WINDOW_MS: '60000',
    },
  });
  const results = [];
  const record = (id, ok, detail) => results.push({ id, ok, detail });

  const unauth = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'verify:unauth',
    })),
  }), security);
  record(1, unauth.status === 401, `unauthenticated → ${unauth.status}`);

  const badLogin = await handleDemoSessionPost(new Request(`${origin}/api/research-agent/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ password: 'definitely-not-the-password' }),
  }), security);
  const badBody = await badLogin.json();
  record(2, badLogin.status === 401 && badBody.error === AUTH_FAILED_ERROR, `bad password → ${badLogin.status}`);

  const login = await handleDemoSessionPost(new Request(`${origin}/api/research-agent/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ password }),
  }), security);
  const flags = cookieFlags(login.headers.get('set-cookie'));
  record(3, login.status === 200 && flags.httpOnly && flags.sameSiteLax && flags.path, 'login cookie flags');
  const tokenMatch = (login.headers.get('set-cookie') ?? '').match(/nl_demo=([^;]+)/);
  const cookie = tokenMatch ? `nl_demo=${decodeURIComponent(tokenMatch[1])}` : '';

  const ask = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify(buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'verify:ok',
    })),
  }), security);
  record(4, ask.status === 200, `authenticated ask → ${ask.status}`);

  const unknown = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify({
      question: 'What is the median reaction time?',
      intent: { kind: 'report_metric', session_ref: 'export:session:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', metric_id: 'reaction_time_median_ms' },
      session_scope: ['export:session:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    }),
  }), security);
  record(5, unknown.status === 403, `unknown session → ${unknown.status}`);

  const hidden = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify({
      question: 'What is the median reaction time?',
      intent: { kind: 'report_metric', session_ref: 'fixture:session:hidden', metric_id: 'reaction_time_median_ms' },
      session_scope: ['fixture:session:hidden'],
    }),
  }), security);
  record(6, hidden.status === 403, `hidden session → ${hidden.status}`);

  const evidence = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify({
      ...buildClientPayload({ session_ref: 'fixture:session:a', question_id: 'rt-median', request_id: 'verify:ev' }),
      evidence: { metrics: [{ value: 1 }] },
    }),
  }), security);
  record(7, evidence.status === 400, `client evidence → ${evidence.status}`);

  const provider = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify({
      ...buildClientPayload({ session_ref: 'fixture:session:a', question_id: 'rt-median', request_id: 'verify:prov' }),
      provider: 'openai',
    }),
  }), security);
  record(8, provider.status === 400, `client provider → ${provider.status}`);

  const huge = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: `${'{"question":"'.padEnd(9000, 'x')}"}`,
  }), security);
  record(9, huge.status === 413, `oversized → ${huge.status}`);

  const tightLogin = await handleDemoSessionPost(new Request(`${origin}/api/research-agent/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ password }),
  }), tight);
  const tightMatch = (tightLogin.headers.get('set-cookie') ?? '').match(/nl_demo=([^;]+)/);
  const tightCookie = tightMatch ? `nl_demo=${decodeURIComponent(tightMatch[1])}` : '';
  await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie: tightCookie },
    body: JSON.stringify(buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'verify:rl1',
    })),
  }), tight);
  const limited = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie: tightCookie },
    body: JSON.stringify(buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'verify:rl2',
    })),
  }), tight);
  record(10, limited.status === 429 && (await limited.json()).error === RATE_LIMITED_ERROR, `rate limit → ${limited.status}`);

  const logout = await handleDemoSessionDelete(new Request(`${origin}/api/research-agent/session`, {
    method: 'DELETE',
    headers: { origin, cookie },
  }), security);
  record(11, logout.status === 200, `logout → ${logout.status}`);

  const replay = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify(buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'verify:replay',
    })),
  }), security);
  record(12, replay.status === 401 && (await replay.json()).error === AUTH_REQUIRED_ERROR, `replay → ${replay.status}`);

  const csrf = await handleResearchAgentPost(new Request(`${origin}/api/research-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie },
    body: JSON.stringify(buildClientPayload({
      session_ref: 'fixture:session:a',
      question_id: 'rt-median',
      request_id: 'verify:csrf',
    })),
  }), security);
  record(13, csrf.status === 403, `invalid origin → ${csrf.status}`);

  const missingSecrets = loadDemoSecurityConfig({ NEUROLENS_DEMO_DEPLOYMENT: 'preview' });
  record(14, missingSecrets.ok === false, 'missing preview secrets fail closed');
  const catalog = await handleResearchAgentGet({
    ...createTestSecurity({ env: { NEUROLENS_DEMO_DEPLOYMENT: 'preview' } }),
    request: new Request(`${origin}/api/research-agent`),
  });
  record(15, catalog.status === 503 && (await catalog.json()).error === CONFIG_ERROR, `real-provider/misconfig → ${catalog.status}`);

  return results;
}

function printRemotePlan() {
  return [
    'REMOTE HTTP PLAN (not executed unless --base is passed after explicit approval)',
    '1. POST /api/research-agent without cookie → 401',
    '2. POST /api/research-agent/session with wrong password from env → 401',
    '3. POST /api/research-agent/session with NEUROLENS_DEMO_PASSWORD → Set-Cookie flags only',
    '4. POST fixture:session:a rt-median → 200',
    '5-9. unknown/hidden/evidence/provider/oversized → 403/403/400/400/413',
    '10. repeat until 429',
    '11-12. DELETE session then replay cookie → 401',
    '13. Origin https://evil.example → 403',
    '14-15. inspect config; do not enable openai',
    'Do not print cookies, passwords, or full authenticated headers.',
  ];
}

const results = offline ? await runOffline() : null;
if (!offline) {
  console.log(printRemotePlan().join('\n'));
  console.error('Refusing to hit a remote host from this script without a later authorized run.');
  process.exit(2);
}

const failed = results.filter((item) => !item.ok);
for (const item of results) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.id} ${item.detail}`);
}
console.log(JSON.stringify({
  mode: 'offline',
  passed: results.filter((item) => item.ok).length,
  failed: failed.length,
  redacted_headers_example: redactHeaders(new Headers({ 'set-cookie': 'nl_demo=secret', 'x-request-id': 'preview-corr-001' })),
}));
process.exit(failed.length === 0 ? 0 : 1);
