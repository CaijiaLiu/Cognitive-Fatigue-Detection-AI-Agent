/**
 * Research Agent demo login/logout/session endpoints.
 * Password is accepted only in a same-origin JSON body.
 */
import { isPlainObject } from '../agent/validate.mjs';
import { loadAgentProviderConfig, publicProviderView } from './config.mjs';
import { DEMO_DISCLAIMER } from './demo-ui.mjs';
import {
  AUTH_FAILED_ERROR,
  CONFIG_ERROR,
  RATE_LIMITED_ERROR,
  consumeRateLimit,
  issueDemoSession,
  loadDemoSecurityConfig,
  readDemoSession,
  requestIdFrom,
  revokeDemoSession,
  secretsEqual,
  writeDemoLog,
} from './demo-security.mjs';
import { AGENT_API_VERSION, agentErrorBody, agentJson, sameOrigin } from './http-shared.mjs';

function resolveConfig(options) {
  return options.security ?? loadDemoSecurityConfig(options.env ?? {});
}

function providerView(options) {
  return publicProviderView(options.providerConfig ?? loadAgentProviderConfig(options.env ?? {}));
}

function logSession(options, started, request_id, endpoint, outcome, extras = {}) {
  return writeDemoLog({
    request_id,
    endpoint,
    outcome,
    provider_mode: extras.provider_mode ?? resolveConfig(options).provider_kind,
    latency_ms: (options.now?.() ?? Date.now()) - started,
    ...extras,
  }, options.logger);
}

export async function handleDemoSessionGet(request, options = {}) {
  const started = options.now?.() ?? Date.now();
  const request_id = requestIdFrom(request);
  const config = resolveConfig(options);
  if (!config.ok) {
    logSession(options, started, request_id, 'GET /api/research-agent/session', 'config_error', {
      error_category: 'misconfigured',
      provider_mode: config.provider_kind,
    });
    return agentJson(503, agentErrorBody(CONFIG_ERROR), { 'X-Request-ID': request_id });
  }
  const session = config.auth_required
    ? await readDemoSession(request, { config, store: options.sessionStore, now: options.now })
    : { ok: true };
  logSession(options, started, request_id, 'GET /api/research-agent/session', 'success', {
    authenticated: config.auth_required && session.ok === true,
    provider_mode: config.provider_kind,
  });
  return agentJson(200, {
    ok: true,
    api_version: AGENT_API_VERSION,
    authenticated: config.auth_required ? session.ok === true : true,
    auth_required: config.auth_required,
    deployment: config.deployment,
    demo: DEMO_DISCLAIMER,
    provider: providerView(options),
  }, { 'X-Request-ID': request_id });
}

export async function handleDemoSessionPost(request, options = {}) {
  const started = options.now?.() ?? Date.now();
  const request_id = requestIdFrom(request);
  const config = resolveConfig(options);
  const headers = { 'X-Request-ID': request_id };
  if (!config.ok) {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'config_error', {
      error_category: 'misconfigured',
      provider_mode: config.provider_kind,
    });
    return agentJson(503, agentErrorBody(CONFIG_ERROR), headers);
  }
  if (!sameOrigin(request)) {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'unauthorized', {
      error_category: 'origin',
      authenticated: false,
      provider_mode: config.provider_kind,
    });
    return agentJson(403, agentErrorBody('Request origin is not allowed.'), headers);
  }
  if (new URL(request.url).searchParams.has('password')) {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'unauthorized', {
      error_category: 'auth_failed',
      authenticated: false,
      provider_mode: config.provider_kind,
    });
    return agentJson(400, agentErrorBody(AUTH_FAILED_ERROR), headers);
  }
  if (!options.sessionStore || !options.rateLimitStore) {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'config_error', {
      error_category: 'misconfigured',
      provider_mode: config.provider_kind,
    });
    return agentJson(503, agentErrorBody(CONFIG_ERROR), headers);
  }

  const limited = await consumeRateLimit({
    request,
    session: null,
    config: { ...config, rate_limit_enabled: true },
    store: options.rateLimitStore,
    now: options.now,
    scope: 'login',
  });
  if (!limited.allowed) {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'rate_limited', {
      rate_limited: true,
      error_category: 'login_rate_limit',
      authenticated: false,
      provider_mode: config.provider_kind,
    });
    return agentJson(429, agentErrorBody(RATE_LIMITED_ERROR), {
      ...headers,
      'Retry-After': String(limited.retry_after_s ?? 1),
    });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/json')) {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'unauthorized', {
      error_category: 'auth_failed',
      authenticated: false,
      provider_mode: config.provider_kind,
    });
    return agentJson(400, agentErrorBody(AUTH_FAILED_ERROR), headers);
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > 1024) {
      logSession(options, started, request_id, 'POST /api/research-agent/session', 'unauthorized', {
        error_category: 'auth_failed',
        authenticated: false,
        provider_mode: config.provider_kind,
      });
      return agentJson(400, agentErrorBody(AUTH_FAILED_ERROR), headers);
    }
    body = JSON.parse(text);
  } catch {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'unauthorized', {
      error_category: 'auth_failed',
      authenticated: false,
      provider_mode: config.provider_kind,
    });
    return agentJson(400, agentErrorBody(AUTH_FAILED_ERROR), headers);
  }

  if (!isPlainObject(body) || typeof body.password !== 'string' || Object.keys(body).some((key) => key !== 'password')) {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'unauthorized', {
      error_category: 'auth_failed',
      authenticated: false,
      provider_mode: config.provider_kind,
    });
    return agentJson(400, agentErrorBody(AUTH_FAILED_ERROR), headers);
  }
  if (!config.password || !await secretsEqual(body.password, config.password)) {
    logSession(options, started, request_id, 'POST /api/research-agent/session', 'unauthorized', {
      error_category: 'auth_failed',
      authenticated: false,
      provider_mode: config.provider_kind,
    });
    return agentJson(401, agentErrorBody(AUTH_FAILED_ERROR), headers);
  }

  const issued = await issueDemoSession({
    config,
    store: options.sessionStore,
    now: options.now,
  });
  logSession(options, started, request_id, 'POST /api/research-agent/session', 'success', {
    authenticated: true,
    provider_mode: config.provider_kind,
  });
  return agentJson(200, {
    ok: true,
    api_version: AGENT_API_VERSION,
    authenticated: true,
    deployment: config.deployment,
    demo: DEMO_DISCLAIMER,
    provider: providerView(options),
  }, {
    ...headers,
    'Set-Cookie': issued.cookie,
  });
}

export async function handleDemoSessionDelete(request, options = {}) {
  const started = options.now?.() ?? Date.now();
  const request_id = requestIdFrom(request);
  const config = resolveConfig(options);
  const headers = { 'X-Request-ID': request_id };
  if (!config.ok) {
    logSession(options, started, request_id, 'DELETE /api/research-agent/session', 'config_error', {
      error_category: 'misconfigured',
      provider_mode: config.provider_kind,
    });
    return agentJson(503, agentErrorBody(CONFIG_ERROR), headers);
  }
  if (!sameOrigin(request)) {
    logSession(options, started, request_id, 'DELETE /api/research-agent/session', 'unauthorized', {
      error_category: 'origin',
      provider_mode: config.provider_kind,
    });
    return agentJson(403, agentErrorBody('Request origin is not allowed.'), headers);
  }
  const revoked = await revokeDemoSession(request, {
    config,
    store: options.sessionStore,
    now: options.now,
  });
  logSession(options, started, request_id, 'DELETE /api/research-agent/session', 'success', {
    authenticated: false,
    provider_mode: config.provider_kind,
  });
  return agentJson(200, {
    ok: true,
    api_version: AGENT_API_VERSION,
    authenticated: false,
    demo: DEMO_DISCLAIMER,
  }, {
    ...headers,
    'Set-Cookie': revoked.cookie,
  });
}
