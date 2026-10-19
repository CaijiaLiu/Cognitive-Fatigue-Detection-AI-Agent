/**
 * HTTP adapter for the W2.1 runtime. Synthetic fixtures + mock provider only.
 * Server-side allowlist is authoritative. Client evidence is never trusted.
 */
import {
  ALLOWED_METRIC_IDS,
  ALLOWED_METRICS,
  REASON_CODES,
  composeAnswer,
  createAnalysisTools,
  createFixtureStore,
  isOpaqueRef,
} from '../agent/index.mjs';
import { isPlainObject } from '../agent/validate.mjs';
import { ProviderError, createMockProvider } from './provider.mjs';
import { createResearchAgentRuntime } from './orchestrate.mjs';
import { DEMO_DISCLAIMER, DEMO_QUESTIONS, DEMO_SESSIONS } from './demo-ui.mjs';
import { createConfiguredProvider, loadAgentProviderConfig, publicProviderView } from './config.mjs';
import { AGENT_API_VERSION, agentErrorBody, agentJson, sameOrigin } from './http-shared.mjs';
import { enforceDemoAccess, writeDemoLog } from './demo-security.mjs';

export { AGENT_API_VERSION, sameOrigin } from './http-shared.mjs';
export const MAX_AGENT_BODY_BYTES = 8192;
export const ALLOWED_SESSION_REFS = Object.freeze(DEMO_SESSIONS.map((item) => item.session_ref));
export const ALLOWED_INTENT_KINDS = Object.freeze(['report_metric', 'compare_metric', 'lookup_artifact']);

function json(status, body, extraHeaders = {}) {
  return agentJson(status, body, extraHeaders);
}

function errorBody(error, extras = {}) {
  return agentErrorBody(error, extras);
}

export function createDemoRuntime({ tools, provider, timeout_ms, now, clock, env, config, fetchImpl } = {}) {
  const agentTools = tools ?? createAnalysisTools({ store: createFixtureStore() });
  const resolved = config ?? loadAgentProviderConfig(env ?? process.env);
  if (!provider && !resolved.ok) {
    throw new ProviderError(resolved.reason_code, resolved.error);
  }
  if (!provider && resolved.kind === 'openai' && resolved.allow_live !== true) {
    throw new ProviderError(
      REASON_CODES.PROVIDER_UNAVAILABLE,
      'Real provider is configured but NEUROLENS_AGENT_ALLOW_LIVE is not set. Paid calls stay opt-in.',
    );
  }
  return {
    tools: agentTools,
    config: resolved,
    ask(runtimeRequest) {
      let selected = provider;
      if (!selected) {
        selected = createConfiguredProvider(resolved, {
          timeout_ms,
          fetchImpl,
          response: composeAnswer(runtimeRequest.intent, agentTools),
        });
      }
      return createResearchAgentRuntime({
        tools: agentTools,
        provider: selected,
        timeout_ms: timeout_ms ?? resolved.timeout_ms,
        now,
        clock,
      }).ask(runtimeRequest);
    },
  };
}

function publicAudit(audit) {
  return {
    request_id: audit.request_id,
    provider_id: audit.provider_id,
    model: audit.model,
    session_scope: audit.session_scope,
    tool_calls: audit.tool_calls,
    artifact_refs: audit.artifact_refs,
    validation: audit.validation,
    failure_class: audit.failure_class,
    failure_reason: audit.failure_reason,
    provider_invoked: audit.provider_invoked,
    duration_ms: audit.duration_ms,
    limitations: audit.limitations,
  };
}

function rejectUnauthorized(sessionRefs) {
  return sessionRefs.some((ref) => !ALLOWED_SESSION_REFS.includes(ref));
}

function intentSessionRefs(intent) {
  if (typeof intent.session_ref === 'string') return [intent.session_ref];
  if (Array.isArray(intent.session_refs)) return intent.session_refs;
  return [];
}

export function validateAgentHttpBody(body) {
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, error: 'Request body must be a JSON object.', reason_code: REASON_CODES.MALFORMED_OUTPUT };
  }
  const extra = Object.keys(body).filter((key) => !['question', 'intent', 'session_scope', 'request_id'].includes(key));
  if (extra.length > 0) {
    return { ok: false, status: 400, error: `Unexpected fields: ${extra.join(', ')}.`, reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  if (body.provider || body.model || body.api_key || body.openai_api_key) {
    return { ok: false, status: 400, error: 'Client-selected providers and credentials are not accepted.', reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  if (body.evidence || body.tool_results || body.artifacts) {
    return { ok: false, status: 400, error: 'Client-provided evidence is not accepted.', reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  if (typeof body.question !== 'string' || body.question.trim().length === 0 || body.question.length > 2000) {
    return { ok: false, status: 400, error: 'question must be a non-empty string.', reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  if (!isPlainObject(body.intent) || !ALLOWED_INTENT_KINDS.includes(body.intent.kind)) {
    return { ok: false, status: 400, error: 'intent.kind must be a supported runtime kind.', reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  if (body.intent.path || body.intent.url || body.intent.sql || body.intent.type) {
    return { ok: false, status: 400, error: 'Intent uses unsupported or unsafe fields. Use W2.1 intent.kind.', reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  if (body.intent.kind !== 'lookup_artifact') {
    if (!ALLOWED_METRIC_IDS.includes(body.intent.metric_id)) {
      return { ok: false, status: 400, error: 'metric_id is not allowlisted.', reason_code: REASON_CODES.UNKNOWN_METRIC };
    }
  }
  if (!Array.isArray(body.session_scope) || body.session_scope.length === 0) {
    return { ok: false, status: 400, error: 'session_scope is required.', reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  if (!body.session_scope.every(isOpaqueRef) || intentSessionRefs(body.intent).some((ref) => !isOpaqueRef(ref))) {
    return { ok: false, status: 400, error: 'Session refs must be opaque identifiers, not paths or URLs.', reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  const needed = [...body.session_scope, ...intentSessionRefs(body.intent)];
  if (rejectUnauthorized(needed)) {
    return { ok: false, status: 403, error: 'One or more session refs are outside the server allowlist.', reason_code: REASON_CODES.REJECTED_REQUEST };
  }
  return { ok: true, value: body };
}

async function readJsonBody(request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/json')) {
    return { ok: false, status: 400, error: 'Content-Type must be application/json.' };
  }
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_AGENT_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Request body exceeds the demo size limit.' };
  }
  const text = await request.text();
  if (text.length > MAX_AGENT_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Request body exceeds the demo size limit.' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'Request body is not valid JSON.' };
  }
}

export async function handleResearchAgentGet(options = {}) {
  const request = options.request ?? new Request('http://127.0.0.1/api/research-agent');
  const guard = await enforceDemoAccess(request, options, { endpoint: 'GET /api/research-agent' });
  if (!guard.ok) {
    return json(guard.status, errorBody(guard.error), guard.headers);
  }
  const config = options.config ?? loadAgentProviderConfig(options.env ?? process.env);
  writeDemoLog({
    request_id: guard.request_id,
    endpoint: 'GET /api/research-agent',
    outcome: 'success',
    authenticated: Boolean(guard.session?.ok),
    provider_mode: guard.config.provider_kind,
    latency_ms: (options.now?.() ?? Date.now()) - guard.started,
  }, options.logger);
  return json(200, {
    ok: true,
    api_version: AGENT_API_VERSION,
    demo: DEMO_DISCLAIMER,
    provider: publicProviderView(config),
    sessions: DEMO_SESSIONS,
    questions: DEMO_QUESTIONS,
    allowed_metrics: ALLOWED_METRICS,
    allowed_session_refs: ALLOWED_SESSION_REFS,
    authenticated: Boolean(guard.session?.ok) || !guard.config.auth_required,
  }, guard.headers);
}

export async function handleResearchAgentPost(request, options = {}) {
  if (!sameOrigin(request)) {
    return json(403, errorBody('Request origin is not allowed.'));
  }
  const guard = await enforceDemoAccess(request, options, { endpoint: 'POST /api/research-agent' });
  if (!guard.ok) {
    return json(guard.status, errorBody(guard.error), guard.headers);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    writeDemoLog({
      request_id: guard.request_id,
      endpoint: 'POST /api/research-agent',
      outcome: 'invalid',
      authenticated: Boolean(guard.session?.ok),
      provider_mode: guard.config.provider_kind,
      error_category: 'malformed',
      latency_ms: (options.now?.() ?? Date.now()) - guard.started,
    }, options.logger);
    return json(parsed.status, errorBody(parsed.error), guard.headers);
  }
  const checked = validateAgentHttpBody(parsed.value);
  if (!checked.ok) {
    writeDemoLog({
      request_id: guard.request_id,
      endpoint: 'POST /api/research-agent',
      outcome: checked.status === 403 ? 'unauthorized' : 'invalid',
      authenticated: Boolean(guard.session?.ok),
      provider_mode: guard.config.provider_kind,
      error_category: checked.status === 403 ? 'session_allowlist' : 'rejected_request',
      latency_ms: (options.now?.() ?? Date.now()) - guard.started,
    }, options.logger);
    return json(checked.status, errorBody(checked.error, { reason_code: checked.reason_code }), guard.headers);
  }
  let runtime;
  try {
    runtime = options.runtime ?? createDemoRuntime(options);
  } catch (error) {
    const message = error instanceof ProviderError
      ? error.message
      : 'The configured research-agent provider is unavailable.';
    writeDemoLog({
      request_id: guard.request_id,
      endpoint: 'POST /api/research-agent',
      outcome: 'provider_error',
      authenticated: Boolean(guard.session?.ok),
      provider_mode: guard.config.provider_kind,
      error_category: 'provider_unavailable',
      latency_ms: (options.now?.() ?? Date.now()) - guard.started,
    }, options.logger);
    return json(503, errorBody(message, {
      reason_code: error?.reason_code ?? REASON_CODES.PROVIDER_UNAVAILABLE,
    }), guard.headers);
  }
  let result;
  try {
    result = await runtime.ask(checked.value);
  } catch (error) {
    const message = error instanceof ProviderError
      ? error.message
      : 'The configured research-agent provider is unavailable.';
    writeDemoLog({
      request_id: guard.request_id,
      endpoint: 'POST /api/research-agent',
      outcome: 'provider_error',
      authenticated: Boolean(guard.session?.ok),
      provider_mode: guard.config.provider_kind,
      error_category: 'provider_unavailable',
      latency_ms: (options.now?.() ?? Date.now()) - guard.started,
    }, options.logger);
    return json(503, errorBody(message, {
      reason_code: error?.reason_code ?? REASON_CODES.PROVIDER_UNAVAILABLE,
    }), guard.headers);
  }
  const providerFailed = result.audit.failure_class === 'provider';
  const status = providerFailed ? 503 : 200;
  writeDemoLog({
    request_id: guard.request_id,
    endpoint: 'POST /api/research-agent',
    outcome: providerFailed ? 'provider_error' : 'success',
    authenticated: Boolean(guard.session?.ok),
    provider_mode: guard.config.provider_kind,
    error_category: providerFailed ? 'provider' : null,
    latency_ms: result.audit?.duration_ms ?? ((options.now?.() ?? Date.now()) - guard.started),
  }, options.logger);
  return json(status, {
    ok: !providerFailed,
    api_version: AGENT_API_VERSION,
    demo: DEMO_DISCLAIMER,
    provider: publicProviderView(runtime.config ?? loadAgentProviderConfig(options.env ?? process.env)),
    answer: result.answer,
    audit: publicAudit(result.audit),
  }, guard.headers);
}
