/**
 * Redact identifier/privacy fields and copy allowlisted V1 behavioral summaries.
 * Missing numeric values stay missing. Scientific metric meaning is still pending review.
 */
import { summarizeTrials } from '../../../../public/collection/tasks/summary.js';
import {
  ALLOWED_METRIC_IDS,
  ALLOWED_METRICS,
  COLLECTION_SCHEMA_V1,
  EXPORT_ANALYSIS_VERSION,
  EXPORT_LIMIT,
  PARTICIPANT_SCOPE,
  PROTOCOL_VERSIONS,
  REASON_CODES,
  SOURCE_PROTOCOL_GO_NO_GO_V1,
  TOOL_STATUS,
} from '../agent/constants.mjs';
import { cloneJson, deepFreeze } from '../agent/artifacts.mjs';
import { isOpaqueRef, isPlainObject } from '../agent/validate.mjs';

const DROPPED_KEYS = Object.freeze([
  'participant_id',
  'environment',
  'notes',
  'events',
  'video',
  'withdrawal_token',
  'upload_token',
  'user_agent',
]);

function fieldName(metricId) {
  return ALLOWED_METRICS[metricId].collection_field.split('.').at(-1);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function observationCount(metricId, trials) {
  if (!Array.isArray(trials)) return undefined;
  const valid = trials.filter((trial) => !trial.invalid_reason);
  if (metricId === 'reaction_time_median_ms') {
    return valid.filter((trial) => trial.type === 'go' && trial.correct === true && finiteNumber(trial.reaction_ms)).length;
  }
  return valid.length;
}

export function redactSession(session) {
  const copy = cloneJson(session);
  for (const key of DROPPED_KEYS) {
    delete copy[key];
  }
  if (copy.environment) delete copy.environment;
  return deepFreeze(copy);
}

export function sessionRefFor(sessionId) {
  return `export:session:${sessionId}`;
}

export function summaryRefFor(sessionId) {
  return `export:session-summary:${sessionId}`;
}

function copyAllowlistedMetrics(summary, trials) {
  const metrics = [];
  for (const metricId of ALLOWED_METRIC_IDS) {
    const raw = summary?.[fieldName(metricId)];
    if (raw === null || raw === undefined) continue;
    if (!finiteNumber(raw)) continue;
    if (metricId === 'accuracy' && (raw < 0 || raw > 1)) continue;
    if (metricId === 'valid_trial_count' && (!Number.isInteger(raw) || raw < 0)) continue;
    const metric = {
      metric_id: metricId,
      value: raw,
      unit: ALLOWED_METRICS[metricId].unit,
    };
    const n = observationCount(metricId, trials);
    if (n !== undefined) metric.n = n;
    metrics.push(metric);
  }
  return metrics;
}

export function summariesAgree(stored, recomputed) {
  return ALLOWED_METRIC_IDS.every((metricId) => {
    const field = fieldName(metricId);
    return Object.is(stored?.[field] ?? null, recomputed?.[field] ?? null);
  });
}

function qualityFor(session, metrics) {
  const reason_codes = [];
  if (session.sources.vision === 'simulated') reason_codes.push('simulated_vision');
  if (session.sources.vision === 'unavailable') reason_codes.push('unavailable_vision');
  if (metrics.length === 0) reason_codes.push('missing_feature');
  return {
    usable: metrics.length > 0,
    reason_codes,
  };
}

function limitationsFor(session) {
  const lines = [
    EXPORT_LIMIT,
    'Numbers are copied from the stored V1 behavior_summary; no model inference was performed.',
    'Caijia has not confirmed the scientific definitions of the copied metric identifiers.',
  ];
  if (session.sources.vision === 'simulated') {
    lines.push('Vision source is simulated; these numbers are not camera evidence.');
  }
  if (session.sources.vision === 'unavailable') {
    lines.push('Vision was unavailable; ocular candidate fields were not copied and were not zero-filled.');
  }
  return lines;
}

export function ingestError(status, reason_code, limitations) {
  return { status, reason_code, limitations };
}

function usableBehavioralEvidence(summary, metrics) {
  const validCount = summary?.valid_trial_count;
  if (!Number.isInteger(validCount) || validCount <= 0) return false;
  return metrics.some((metric) => metric.metric_id !== 'valid_trial_count' || metric.value > 0);
}

export function normalizeAcceptedSession(session, { source_export_sha256 }) {
  if (Array.isArray(session.trials)) {
    const recomputed = summarizeTrials(session.trials);
    if (!summariesAgree(session.behavior_summary, recomputed)) {
      return {
        session_ref: sessionRefFor(session.session_id),
        session_id: session.session_id,
        protocol_version: PROTOCOL_VERSIONS.GO_NO_GO_V1,
        source_protocol: SOURCE_PROTOCOL_GO_NO_GO_V1,
        collection_schema_version: COLLECTION_SCHEMA_V1,
        analysis_version: EXPORT_ANALYSIS_VERSION,
        participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
        quality: { usable: false, reason_codes: [REASON_CODES.INCONSISTENT_EVIDENCE] },
        metrics: [],
        limitations: [EXPORT_LIMIT, 'Stored behavior_summary does not match summarizeTrials on the same trials.'],
        created_at: new Date(session.ended_at).toISOString(),
        source_export_sha256,
        redacted: redactSession(session),
        ingest_error: ingestError(TOOL_STATUS.UNAVAILABLE, REASON_CODES.INCONSISTENT_EVIDENCE, [
          'Stored behavior_summary does not match summarizeTrials on the same trials.',
        ]),
      };
    }
  }

  const copied = copyAllowlistedMetrics(session.behavior_summary, session.trials);
  const metrics = usableBehavioralEvidence(session.behavior_summary, copied) ? copied : [];
  return {
    session_ref: sessionRefFor(session.session_id),
    session_id: session.session_id,
    protocol_version: PROTOCOL_VERSIONS.GO_NO_GO_V1,
    source_protocol: SOURCE_PROTOCOL_GO_NO_GO_V1,
    collection_schema_version: COLLECTION_SCHEMA_V1,
    analysis_version: EXPORT_ANALYSIS_VERSION,
    participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
    quality: qualityFor(session, metrics),
    metrics,
    limitations: limitationsFor(session),
    created_at: new Date(session.ended_at).toISOString(),
    source_export_sha256,
    redacted: redactSession(session),
  };
}

export function normalizeRejectedSession(session, failure, { source_export_sha256 }) {
  const sessionId = isPlainObject(session) && typeof session.session_id === 'string'
    ? session.session_id
    : null;
  const candidate = sessionId ? `export:session:${sessionId}` : null;
  const session_ref = candidate && isOpaqueRef(candidate) ? candidate : null;
  return {
    session_ref,
    session_id: sessionId,
    protocol_version: session?.config?.protocol === 'fixture-protocol/0.2' ? 'fixture-protocol/0.2' : undefined,
    source_protocol: isPlainObject(session?.config) ? session.config.protocol : undefined,
    collection_schema_version: session?.schema_version,
    analysis_version: EXPORT_ANALYSIS_VERSION,
    participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
    quality: { usable: false, reason_codes: [failure.reason_code] },
    metrics: [],
    limitations: [EXPORT_LIMIT, failure.message],
    created_at: '2026-10-19T00:00:00.000Z',
    source_export_sha256,
    redacted: null,
    ingest_error: ingestError(failure.status === 'incompatible' ? TOOL_STATUS.INCOMPATIBLE : TOOL_STATUS.UNAVAILABLE, failure.reason_code, [
      failure.message,
    ]),
  };
}
