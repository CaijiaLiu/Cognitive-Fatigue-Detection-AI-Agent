/**
 * Demo authentication, session cookies, rate limiting, and privacy-safe logs.
 * Workers-compatible: Web Crypto only. No Node APIs, no D1 import.
 */
import { loadAgentProviderConfig } from './config.mjs';

export const DEMO_COOKIE_NAME = 'nl_demo';
export const DEMO_DEPLOYMENTS = Object.freeze(['local', 'public']);
export const AUTH_REQUIRED_ERROR = 'Authentication required.';
export const AUTH_FAILED_ERROR = 'Authentication failed.';
export const NOT_AUTHORIZED_ERROR = 'Request is not authorized.';
export const RATE_LIMITED_ERROR = 'Too many requests.';
export const CONFIG_ERROR = 'Demo is not configured.';

const WEAK_PASSWORDS = new Set([
  'password',
  'demo',
  'neurolens',
  'changeme',
  '1234567890123456',
  'local-dev-password',
]);

const ENV = Object.freeze({
  DEPLOYMENT: 'NEUROLENS_DEMO_DEPLOYMENT',
  PASSWORD: 'NEUROLENS_DEMO_PASSWORD',
  SESSION_SECRET: 'NEUROLENS_DEMO_SESSION_SECRET',
  RATE_SECRET: 'NEUROLENS_DEMO_RATE_SECRET',
  RATE_WINDOW: 'NEUROLENS_DEMO_RATE_WINDOW_MS',
  RATE_LIMIT: 'NEUROLENS_DEMO_RATE_LIMIT',
  LOGIN_LIMIT: 'NEUROLENS_DEMO_LOGIN_RATE_LIMIT',
  SESSION_TTL: 'NEUROLENS_DEMO_SESSION_TTL_S',
  TRUST_CF_IP: 'NEUROLENS_DEMO_TRUST_CF_IP',
});

export const DEMO_ENV = ENV;

function readInt(env, name, fallback, { min, max } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return { error: `${name} must be an integer.` };
  if (min !== undefined && value < min) return { error: `${name} is below ${min}.` };
  if (max !== undefined && value > max) return { error: `${name} exceeds ${max}.` };
  return value;
}

export function loadDemoSecurityConfig(env = {}, extras = {}) {
  const deployment = String(env[ENV.DEPLOYMENT] ?? 'local').trim().toLowerCase() || 'local';
  const password = typeof env[ENV.PASSWORD] === 'string' ? env[ENV.PASSWORD] : '';
  const sessionSecret = typeof env[ENV.SESSION_SECRET] === 'string' ? env[ENV.SESSION_SECRET] : '';
  const rateSecret = typeof env[ENV.RATE_SECRET] === 'string' && env[ENV.RATE_SECRET]
    ? env[ENV.RATE_SECRET]
    : (typeof env.RATE_HASH_KEY === 'string' ? env.RATE_HASH_KEY : '');
  const window_ms = readInt(env, ENV.RATE_WINDOW, 60_000, { min: 1_000, max: 3_600_000 });
  const cap = readInt(env, ENV.RATE_LIMIT, 30, { min: 1, max: 1_000 });
  const login_cap = readInt(env, ENV.LOGIN_LIMIT, 10, { min: 1, max: 100 });
  const ttl_s = readInt(env, ENV.SESSION_TTL, 28_800, { min: 60, max: 86_400 });
  const provider = extras.provider ?? loadAgentProviderConfig(env);
  const errors = [];

  for (const parsed of [window_ms, cap, login_cap, ttl_s]) {
    if (parsed?.error) errors.push(parsed.error);
  }
  if (!DEMO_DEPLOYMENTS.includes(deployment)) {
    errors.push('NEUROLENS_DEMO_DEPLOYMENT must be local or public.');
  }

  const auth_required = deployment === 'public' || password.length > 0;
  if (deployment === 'public') {
    if (password.length < 16) errors.push('Public demo requires NEUROLENS_DEMO_PASSWORD of at least 16 characters.');
    if (password && WEAK_PASSWORDS.has(password)) errors.push('Public demo password is not acceptable.');
    if (sessionSecret.length < 32) errors.push('Public demo requires NEUROLENS_DEMO_SESSION_SECRET of at least 32 characters.');
    if (rateSecret.length < 16) errors.push('Public demo requires NEUROLENS_DEMO_RATE_SECRET or RATE_HASH_KEY.');
    if (provider.kind !== 'mock' || provider.allow_live === true) {
      errors.push('Public demo must use the mock provider and must not set NEUROLENS_AGENT_ALLOW_LIVE.');
    }
  }
  if (auth_required && deployment === 'local' && sessionSecret.length === 0) {
    // Local signed cookies still need a secret when a password is configured.
    if (password && password.length < 8) errors.push('Local demo password is too short.');
  }

  const ok = errors.length === 0;
  return {
    ok,
    deployment,
    auth_required,
    rate_limit_enabled: deployment === 'public' || extras.rate_limit_enabled === true || Boolean(env[ENV.RATE_LIMIT]),
    password: ok ? password : '',
    session_secret: sessionSecret || (deployment === 'local' ? 'local-dev-session-secret-not-for-production' : ''),
    rate_secret: rateSecret || (deployment === 'local' ? 'local-dev-rate-secret-not-for-production' : ''),
    window_ms: window_ms?.error ? 60_000 : window_ms,
    cap: cap?.error ? 30 : cap,
    login_cap: login_cap?.error ? 10 : login_cap,
    ttl_ms: (ttl_s?.error ? 28_800 : ttl_s) * 1000,
    trust_cf_ip: env[ENV.TRUST_CF_IP] === '1' || env[ENV.TRUST_CF_IP] === 'true',
    cookie_secure: deployment === 'public' || extras.cookie_secure === true,
    provider_kind: provider.kind ?? 'mock',
    allow_live: provider.allow_live === true,
    errors,
    error: errors[0] ?? null,
  };
}

export function createMemorySessionStore() {
  const rows = new Map();
  return Object.freeze({
    kind: 'memory',
    async put(key, record) {
      rows.set(key, { ...record });
    },
    async get(key) {
      return rows.has(key) ? { ...rows.get(key) } : null;
    },
    async delete(key) {
      rows.delete(key);
    },
  });
}

export function createMemoryRateLimitStore() {
  const rows = new Map();
  return Object.freeze({
    kind: 'memory',
    async increment(key, { now, window_ms }) {
      let bucket = rows.get(key);
      if (!bucket || now >= bucket.reset_at) {
        bucket = { count: 0, reset_at: now + window_ms };
      }
      bucket.count += 1;
      rows.set(key, bucket);
      return { count: bucket.count, reset_at: bucket.reset_at };
    },
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomId(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToHex(buffer);
}

function utf8ToB64url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToUtf8(value) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function hmacHex(secret, value) {
  const key = await hmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return bytesToHex(signature);
}

export async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return bytesToHex(digest);
}

export async function secretsEqual(left, right) {
  const a = await sha256Hex(String(left ?? ''));
  const b = await sha256Hex(String(right ?? ''));
  let diff = a.length ^ b.length;
  const limit = Math.max(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0 && String(left ?? '').length === String(right ?? '').length;
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function serializeDemoCookie(value, { maxAge, secure, clear = false } = {}) {
  const parts = [
    `${DEMO_COOKIE_NAME}=${clear ? '' : encodeURIComponent(value)}`,
    'Path=/api/research-agent',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (clear) {
    parts.push('Max-Age=0');
    parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  } else if (Number.isFinite(maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export async function issueDemoSession({ config, store, now }) {
  const issuedAt = now?.() ?? Date.now();
  const expiresAt = issuedAt + config.ttl_ms;
  const sid = randomId();
  const payload = utf8ToB64url(JSON.stringify({ v: 1, sid, iat: issuedAt, exp: expiresAt }));
  const signature = utf8ToB64url(await hmacHex(config.session_secret, payload));
  await store.put(await sha256Hex(sid), { expires_at: expiresAt, subject: 'demo' });
  return {
    sid,
    token: `${payload}.${signature}`,
    expires_at: expiresAt,
    cookie: serializeDemoCookie(`${payload}.${signature}`, {
      maxAge: Math.floor(config.ttl_ms / 1000),
      secure: config.cookie_secure,
    }),
  };
}

export async function readDemoSession(request, { config, store, now }) {
  const token = parseCookies(request.headers.get('cookie'))[DEMO_COOKIE_NAME];
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid' };
  const [payload, signature] = parts;
  const expected = utf8ToB64url(await hmacHex(config.session_secret, payload));
  if (!await secretsEqual(signature, expected)) return { ok: false, reason: 'invalid' };
  let body;
  try {
    body = JSON.parse(b64urlToUtf8(payload));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const current = now?.() ?? Date.now();
  if (!body || body.v !== 1 || typeof body.sid !== 'string' || !Number.isFinite(body.exp)) {
    return { ok: false, reason: 'invalid' };
  }
  if (body.exp <= current) return { ok: false, reason: 'expired' };
  const record = await store.get(await sha256Hex(body.sid));
  if (!record || record.expires_at <= current) return { ok: false, reason: 'invalid' };
  return { ok: true, sid: body.sid, expires_at: body.exp, subject: record.subject ?? 'demo' };
}

export async function revokeDemoSession(request, { config, store, now }) {
  const current = await readDemoSession(request, { config, store, now });
  if (current.ok) {
    await store.delete(await sha256Hex(current.sid));
  }
  return {
    cleared: current.ok,
    cookie: serializeDemoCookie('', { clear: true, secure: config.cookie_secure }),
  };
}

function trustedClientIp(request, config) {
  if (!config.trust_cf_ip) return null;
  const ip = request.headers.get('cf-connecting-ip');
  return ip && ip.trim() ? ip.trim() : null;
}

export async function consumeRateLimit({
  request,
  session,
  config,
  store,
  now,
  scope = 'ask',
}) {
  if (!config.rate_limit_enabled) {
    return { allowed: true, skipped: true };
  }
  if (!store) {
    return { allowed: false, reason: 'store_missing' };
  }
  const nowMs = now?.() ?? Date.now();
  const window = Math.floor(nowMs / config.window_ms);
  const cap = scope === 'login' ? config.login_cap : config.cap;
  const identity = session?.sid ? `user:${session.sid}` : `anon:${scope}`;
  const userKey = await hmacHex(config.rate_secret, `${scope}:${identity}:${window}`);
  const user = await store.increment(userKey, { now: nowMs, window_ms: config.window_ms, cap });
  if (user.count > cap) {
    return {
      allowed: false,
      identity: 'session',
      retry_after_s: Math.max(1, Math.ceil((user.reset_at - nowMs) / 1000)),
    };
  }
  const ip = trustedClientIp(request, config);
  if (ip) {
    const ipKey = await hmacHex(config.rate_secret, `${scope}:ip:${ip}:${window}`);
    const ipResult = await store.increment(ipKey, { now: nowMs, window_ms: config.window_ms, cap });
    if (ipResult.count > cap) {
      return {
        allowed: false,
        identity: 'ip',
        retry_after_s: Math.max(1, Math.ceil((ipResult.reset_at - nowMs) / 1000)),
      };
    }
  }
  return { allowed: true, remaining: Math.max(0, cap - user.count) };
}

export function createDemoLog(entry = {}) {
  return {
    event: 'research_agent',
    request_id: entry.request_id ?? null,
    timestamp: entry.timestamp ?? new Date(entry.now ?? Date.now()).toISOString(),
    endpoint: entry.endpoint,
    outcome: entry.outcome,
    authenticated: entry.authenticated === true,
    rate_limited: entry.rate_limited === true,
    provider_mode: entry.provider_mode ?? 'mock',
    latency_ms: entry.latency_ms ?? 0,
    error_category: entry.error_category ?? null,
  };
}

export function writeDemoLog(entry, logger) {
  const line = createDemoLog(entry);
  if (typeof logger === 'function') logger(line);
  return line;
}

export function requestIdFrom(request, fallback) {
  const header = request.headers.get('x-request-id');
  if (header && /^[A-Za-z0-9:_-]{6,80}$/.test(header)) return header;
  return fallback ?? `req:${randomId(8)}`;
}

export function cookieHeader(request) {
  return request.headers.get('cookie') ?? '';
}

export async function enforceDemoAccess(request, options, { endpoint, requireAuth = true } = {}) {
  const started = options.now?.() ?? Date.now();
  const request_id = requestIdFrom(request, options.request_id);
  const config = options.security ?? loadDemoSecurityConfig(options.env ?? {});
  const headers = { 'X-Request-ID': request_id };
  const finish = (outcome, extras = {}) => writeDemoLog({
    request_id,
    endpoint,
    outcome,
    authenticated: extras.authenticated === true,
    rate_limited: extras.rate_limited === true,
    provider_mode: config.provider_kind,
    error_category: extras.error_category ?? null,
    latency_ms: (options.now?.() ?? Date.now()) - started,
  }, options.logger);

  if (!config.ok) {
    finish('config_error', { error_category: 'misconfigured' });
    return { ok: false, status: 503, error: CONFIG_ERROR, request_id, headers, config };
  }
  if (config.deployment === 'public' && options.sharedStore !== true && options.allowMemoryLimiter !== true) {
    finish('config_error', { error_category: 'shared_store_missing' });
    return { ok: false, status: 503, error: CONFIG_ERROR, request_id, headers, config };
  }

  let session = null;
  if (requireAuth && config.auth_required) {
    if (!options.sessionStore) {
      finish('config_error', { error_category: 'misconfigured' });
      return { ok: false, status: 503, error: CONFIG_ERROR, request_id, headers, config };
    }
    session = await readDemoSession(request, {
      config,
      store: options.sessionStore,
      now: options.now,
    });
    if (!session.ok) {
      finish('unauthenticated', {
        authenticated: false,
        error_category: session.reason === 'expired' ? 'expired_session' : 'unauthenticated',
      });
      return { ok: false, status: 401, error: AUTH_REQUIRED_ERROR, request_id, headers, config };
    }
  }

  if (config.rate_limit_enabled) {
    const limited = await consumeRateLimit({
      request,
      session,
      config,
      store: options.rateLimitStore,
      now: options.now,
      scope: 'ask',
    });
    if (!limited.allowed) {
      finish('rate_limited', {
        authenticated: Boolean(session?.ok),
        rate_limited: true,
        error_category: limited.reason === 'store_missing' ? 'misconfigured' : 'rate_limited',
      });
      if (limited.reason === 'store_missing') {
        return { ok: false, status: 503, error: CONFIG_ERROR, request_id, headers, config };
      }
      return {
        ok: false,
        status: 429,
        error: RATE_LIMITED_ERROR,
        request_id,
        headers: { ...headers, 'Retry-After': String(limited.retry_after_s ?? 1) },
        config,
        session,
      };
    }
  }

  return { ok: true, request_id, headers, config, session, started };
}

export function createTestSecurity(overrides = {}) {
  const env = {
    NEUROLENS_DEMO_DEPLOYMENT: 'public',
    NEUROLENS_DEMO_PASSWORD: 'public-demo-password-1',
    NEUROLENS_DEMO_SESSION_SECRET: 'demo-session-secret-32-chars-min',
    NEUROLENS_DEMO_RATE_SECRET: 'demo-rate-secret-16',
    NEUROLENS_DEMO_RATE_WINDOW_MS: '1000',
    NEUROLENS_DEMO_RATE_LIMIT: '3',
    NEUROLENS_DEMO_LOGIN_RATE_LIMIT: '5',
    NEUROLENS_AGENT_PROVIDER: 'mock',
    ...(overrides.env ?? {}),
  };
  const logs = [];
  return {
    env,
    security: loadDemoSecurityConfig(env, overrides.securityExtras),
    sessionStore: overrides.sessionStore ?? createMemorySessionStore(),
    rateLimitStore: overrides.rateLimitStore ?? createMemoryRateLimitStore(),
    allowMemoryLimiter: overrides.allowMemoryLimiter ?? true,
    now: overrides.now,
    logger: overrides.logger ?? ((entry) => logs.push(entry)),
    logs,
  };
}
