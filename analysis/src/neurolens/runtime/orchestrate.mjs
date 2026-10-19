/**
 * Read-only Research Agent runtime.
 * Tools and the validator stay authoritative; the provider never chooses
 * session scope or tool arguments and never returns unvalidated claims.
 */
import { randomUUID } from 'node:crypto';
import {
  ANSWER_VERSION,
  CONTRACT_VERSION,
  REASON_CODES,
  composeAnswer,
  containsUnsupportedClaimLanguage,
  isOpaqueRef,
  validateAgentAnswer,
} from '../agent/index.mjs';
import { isPlainObject } from '../agent/validate.mjs';
import { buildPromptPackage, collectEvidence, parseModelResponse } from '../eval/index.mjs';
import { PROMPT_VERSION } from '../eval/constants.mjs';
import { buildAudit } from './audit.mjs';
import {
  DEFAULT_TIMEOUT_MS,
  EVIDENCE_REASON_CODES,
  FAILURE_CLASS,
  RUNTIME_LIMIT,
  RUNTIME_VERSION,
} from './constants.mjs';
import { ProviderError } from './provider.mjs';

const REQUEST_KEYS = Object.freeze(['request_id', 'question', 'intent', 'session_scope']);

function safeAbstain(reason_code, limitations) {
  return {
    answer_version: ANSWER_VERSION,
    status: 'abstained',
    claims: [],
    reason_code,
    limitations: [RUNTIME_LIMIT, ...limitations],
  };
}

function intentSessionRefs(intent) {
  if (!isPlainObject(intent)) return [];
  if (typeof intent.session_ref === 'string') return [intent.session_ref];
  if (Array.isArray(intent.session_refs)) return intent.session_refs;
  return [];
}

function authorizeRequest(request) {
  if (!isPlainObject(request)) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'Runtime request must be a plain object.' };
  }
  const extra = Object.keys(request).filter((key) => !REQUEST_KEYS.includes(key));
  if (extra.length > 0) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: `Runtime request has unexpected fields: ${extra.join(', ')}.` };
  }
  if (typeof request.question !== 'string' || request.question.trim().length === 0 || request.question.length > 2000) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'question must be a non-empty string.' };
  }
  if (request.request_id !== undefined && (typeof request.request_id !== 'string' || !/^[a-z0-9:_-]{1,80}$/i.test(request.request_id))) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'request_id is malformed.' };
  }
  if (!isPlainObject(request.intent)) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'intent must be a plain object.' };
  }
  if (!Array.isArray(request.session_scope) || request.session_scope.length === 0 || request.session_scope.length > 8) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'session_scope must be a bounded array of session refs.' };
  }
  if (!request.session_scope.every(isOpaqueRef)) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'session_scope must contain only opaque session refs.' };
  }
  if (request.intent.path || request.intent.url || request.intent.sql) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'Intent cannot include paths, URLs, or SQL.' };
  }
  const needed = intentSessionRefs(request.intent);
  if (needed.some((ref) => !isOpaqueRef(ref))) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'Intent session refs are not opaque identifiers.' };
  }
  if (needed.some((ref) => !request.session_scope.includes(ref))) {
    return { ok: false, reason_code: REASON_CODES.REJECTED_REQUEST, message: 'Intent session refs are outside the authorized session_scope.' };
  }
  if (containsUnsupportedClaimLanguage(request.question) || containsUnsupportedClaimLanguage(request.intent.kind) || containsUnsupportedClaimLanguage(request.intent.text)) {
    return { ok: false, reason_code: REASON_CODES.UNSUPPORTED_CLAIM, message: 'The request asks for an unsupported clinical or diagnostic claim.' };
  }
  return { ok: true };
}

function caseDefFromRequest(request, request_id) {
  const coverage = request.intent.kind === 'compare_metric' ? 'all' : 'any';
  return {
    id: request_id,
    category: 'runtime',
    title: 'runtime-request',
    question: request.question,
    intent: request.intent,
    validation: {
      expectedSessionRefs: intentSessionRefs(request.intent),
      coverage,
    },
  };
}

function evidenceShouldSkipProvider(gold) {
  return gold.status === 'abstained' && EVIDENCE_REASON_CODES.includes(gold.reason_code);
}

function artifactsBoundToScope(artifacts, session_scope) {
  return artifacts.every((artifact) => (
    Array.isArray(artifact.source_session_refs)
    && artifact.source_session_refs.every((ref) => session_scope.includes(ref))
  ));
}

function providerFailure(error) {
  if (error instanceof ProviderError) {
    return { reason_code: error.reason_code, message: error.message };
  }
  return { reason_code: REASON_CODES.PROVIDER_UNAVAILABLE, message: error?.message ?? 'Provider failed.' };
}

export function createResearchAgentRuntime({
  tools,
  provider,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  clock = Date.now,
  now,
} = {}) {
  if (!tools || typeof tools.invoke !== 'function') {
    throw new Error('createResearchAgentRuntime requires read-only analysis tools.');
  }
  if (!provider || typeof provider.complete !== 'function') {
    throw new Error('createResearchAgentRuntime requires a provider with complete().');
  }

  async function ask(request) {
    const started = clock();
    const evaluated_at = now ?? new Date(started).toISOString();
    const request_id = request?.request_id ?? `runtime:${randomUUID()}`;

    const finish = ({ answer, failure_class, failure_reason, validation, evidence, provider_invoked }) => {
      const duration_ms = Math.max(0, clock() - started);
      const audit = buildAudit({
        request_id,
        provider_id: provider.provider_id,
        model: provider.model,
        question: request?.question,
        session_scope: request?.session_scope ?? [],
        prompt_version: PROMPT_VERSION,
        contract_version: CONTRACT_VERSION,
        analysis_version: tools.analysis_version,
        requests: evidence?.requests ?? [],
        envelopes: evidence?.envelopes ?? [],
        artifacts: evidence?.artifacts ?? [],
        validation,
        failure_class,
        failure_reason,
        provider_invoked,
        timeout_ms,
        duration_ms,
        evaluated_at,
      });
      return { runtime_version: RUNTIME_VERSION, request_id, answer, audit };
    };

    const authorized = authorizeRequest(request);
    if (!authorized.ok) {
      const answer = safeAbstain(authorized.reason_code, [authorized.message]);
      return finish({
        answer,
        failure_class: authorized.reason_code === REASON_CODES.UNSUPPORTED_CLAIM ? FAILURE_CLASS.REQUEST : FAILURE_CLASS.REQUEST,
        failure_reason: authorized.reason_code,
        validation: { ok: true, reason_code: authorized.reason_code },
        evidence: { requests: [], envelopes: [], artifacts: [] },
        provider_invoked: false,
      });
    }

    const caseDef = caseDefFromRequest(request, request_id);
    const evidence = collectEvidence(caseDef, tools);
    if (!artifactsBoundToScope(evidence.artifacts, request.session_scope)) {
      const answer = safeAbstain(REASON_CODES.SESSION_MISMATCH, [
        'Collected evidence includes a session outside the authorized session_scope.',
      ]);
      return finish({
        answer,
        failure_class: FAILURE_CLASS.EVIDENCE,
        failure_reason: REASON_CODES.SESSION_MISMATCH,
        validation: { ok: true, reason_code: REASON_CODES.SESSION_MISMATCH },
        evidence,
        provider_invoked: false,
      });
    }

    const gold = composeAnswer(caseDef.intent, tools);
    if (evidenceShouldSkipProvider(gold)) {
      return finish({
        answer: gold,
        failure_class: FAILURE_CLASS.EVIDENCE,
        failure_reason: gold.reason_code,
        validation: { ok: true, reason_code: gold.reason_code },
        evidence,
        provider_invoked: false,
      });
    }

    const pkg = buildPromptPackage(caseDef, { tools });
    let completion;
    try {
      completion = await provider.complete({
        system: pkg.system_prompt,
        user: pkg.user_prompt,
        timeout_ms,
      });
    } catch (error) {
      const failed = providerFailure(error);
      const answer = safeAbstain(failed.reason_code, [failed.message, 'The provider was not trusted and no numeric claim was copied.']);
      return finish({
        answer,
        failure_class: FAILURE_CLASS.PROVIDER,
        failure_reason: failed.reason_code,
        validation: { ok: true, reason_code: failed.reason_code },
        evidence,
        provider_invoked: true,
      });
    }

    const parsed = parseModelResponse(completion?.text);
    if (!parsed.ok) {
      const answer = safeAbstain(parsed.reason_code, [parsed.message, 'Unparseable provider output was discarded.']);
      return finish({
        answer,
        failure_class: FAILURE_CLASS.VALIDATION,
        failure_reason: parsed.reason_code,
        validation: parsed,
        evidence,
        provider_invoked: true,
      });
    }

    const checked = validateAgentAnswer(parsed.value, [...pkg.artifacts, ...(pkg.extra_artifacts ?? [])], pkg.validation);
    if (!checked.ok) {
      const answer = safeAbstain(checked.reason_code, [checked.message, 'Unvalidated provider claims were discarded.']);
      return finish({
        answer,
        failure_class: FAILURE_CLASS.VALIDATION,
        failure_reason: checked.reason_code,
        validation: checked,
        evidence,
        provider_invoked: true,
      });
    }

    return finish({
      answer: parsed.value,
      failure_class: FAILURE_CLASS.NONE,
      failure_reason: undefined,
      validation: { ok: true },
      evidence,
      provider_invoked: true,
    });
  }

  return Object.freeze({
    runtime_version: RUNTIME_VERSION,
    provider_id: provider.provider_id,
    model: provider.model,
    timeout_ms,
    ask,
  });
}
