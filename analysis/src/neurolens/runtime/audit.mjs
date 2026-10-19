import { createHash } from 'node:crypto';
import { AUDIT_VERSION, RUNTIME_LIMIT } from './constants.mjs';

export function sha256Text(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function toolCallSummary(request, envelope) {
  return {
    tool: envelope.tool ?? request.tool,
    status: envelope.status,
    reason_code: envelope.reason_code,
    artifact_ref: envelope.artifact_ref,
  };
}

export function buildAudit({
  request_id,
  provider_id,
  model,
  question,
  session_scope,
  prompt_version,
  contract_version,
  analysis_version,
  requests = [],
  envelopes = [],
  artifacts = [],
  validation,
  failure_class,
  failure_reason,
  provider_invoked,
  timeout_ms,
  duration_ms,
  evaluated_at,
}) {
  return Object.freeze({
    audit_version: AUDIT_VERSION,
    request_id,
    evaluated_at,
    provider_id,
    model,
    prompt_version,
    contract_version,
    analysis_version,
    question_sha256: sha256Text(question),
    question_length: typeof question === 'string' ? question.length : 0,
    session_scope: [...session_scope],
    tool_calls: requests.map((request, index) => toolCallSummary(request, envelopes[index] ?? {})),
    artifact_refs: artifacts.map((artifact) => artifact.artifact_ref),
    validation: {
      ok: Boolean(validation?.ok),
      reason_code: validation?.reason_code,
    },
    failure_class,
    failure_reason,
    provider_invoked: Boolean(provider_invoked),
    timeout_ms,
    duration_ms,
    limitations: Object.freeze([
      RUNTIME_LIMIT,
      'Audit metadata is an engineering trace, not a medical or scientific record.',
    ]),
  });
}
