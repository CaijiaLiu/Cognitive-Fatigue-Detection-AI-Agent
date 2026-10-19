import {
  ALLOWED_METRIC_IDS,
  ALLOWED_METRICS,
  ALLOWED_TOOLS,
  ANALYSIS_VERSION,
  ANSWER_STATUS,
  ANSWER_VERSION,
  ARTIFACT_KIND,
  ARTIFACT_SCHEMA_VERSION,
  CONTRACT_VERSION,
  DATA_ORIGIN,
  MAX_CLAIMS,
  MAX_LIMITATIONS,
  MAX_REASON_CODES,
  MAX_REF,
  MAX_SESSION_REFS,
  MAX_STRING,
  METRIC_ID_PATTERN,
  PARTICIPANT_SCOPE,
  REASON_CODES,
  REF_PATTERN,
  TOOL_NAMES,
  TOOL_STATUS,
  VERSION_PATTERN,
} from './constants.mjs';

const TOOL_STATUS_VALUES = new Set(Object.values(TOOL_STATUS));
const ANSWER_STATUS_VALUES = new Set(Object.values(ANSWER_STATUS));
const ARTIFACT_KIND_VALUES = new Set(Object.values(ARTIFACT_KIND));
const DATA_ORIGIN_VALUES = new Set(Object.values(DATA_ORIGIN));
const PARTICIPANT_SCOPE_VALUES = new Set(Object.values(PARTICIPANT_SCOPE));
const ALLOWED_TOOL_SET = new Set(ALLOWED_TOOLS);
const ALLOWED_METRIC_SET = new Set(ALLOWED_METRIC_IDS);

const REQUEST_KEYS = Object.freeze({
  [TOOL_NAMES.GET_SESSION_SUMMARY]: Object.freeze(['tool', 'session_ref', 'analysis_version']),
  [TOOL_NAMES.COMPARE_SESSIONS]: Object.freeze(['tool', 'session_refs', 'metric_id', 'analysis_version']),
  [TOOL_NAMES.GET_EVIDENCE]: Object.freeze(['tool', 'artifact_ref']),
});

const FORBIDDEN_REQUEST_PATTERN = /(\.\.|[\\/]|:\/\/|`|\$\(|;|--|\b(select|insert|update|delete|drop|union|exec|execute|attach|load_file)\b)/i;

export function ok(value) {
  return { ok: true, value };
}

export function fail(reason_code, message, details = undefined) {
  return details === undefined
    ? { ok: false, reason_code, message }
    : { ok: false, reason_code, message, details };
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isSafeString(value, max = MAX_STRING) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !FORBIDDEN_REQUEST_PATTERN.test(value);
}

export function isOpaqueRef(value) {
  return typeof value === 'string' && value.length <= MAX_REF && REF_PATTERN.test(value) && !FORBIDDEN_REQUEST_PATTERN.test(value);
}

function isVersionToken(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validateStringList(list, { maxItems, itemMax = MAX_STRING, allowEmpty = false } = {}) {
  if (!Array.isArray(list) || list.length > maxItems) return false;
  if (!allowEmpty && list.length === 0) return false;
  return list.every((item) => typeof item === 'string' && item.length > 0 && item.length <= itemMax);
}

export function validateMetric(metric, { requireSessionRef = false } = {}) {
  if (!isPlainObject(metric)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Metric must be an object.');
  }
  const allowed = new Set(['metric_id', 'value', 'unit', 'n', 'session_ref']);
  if (!Object.keys(metric).every((key) => allowed.has(key))) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Metric has unexpected fields.');
  }
  if (!ALLOWED_METRIC_SET.has(metric.metric_id) || !METRIC_ID_PATTERN.test(metric.metric_id)) {
    return fail(REASON_CODES.UNKNOWN_METRIC, 'Unknown or unsafe metric_id.');
  }
  if (metric.unit !== ALLOWED_METRICS[metric.metric_id].unit) {
    return fail(REASON_CODES.NUMERIC_MISMATCH, 'Metric unit does not match the allowlisted unit.');
  }
  if (!isFiniteNumber(metric.value)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Metric value must be a finite number.');
  }
  if (metric.n !== undefined && (!Number.isInteger(metric.n) || metric.n < 0)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Metric n must be a non-negative integer.');
  }
  if (metric.session_ref !== undefined && !isOpaqueRef(metric.session_ref)) {
    return fail(REASON_CODES.REJECTED_REQUEST, 'Metric session_ref is not a safe opaque identifier.');
  }
  if (requireSessionRef && !isOpaqueRef(metric.session_ref)) {
    return fail(REASON_CODES.REJECTED_REQUEST, 'Comparison metrics require a session_ref.');
  }
  return ok(metric);
}

export function validateToolRequest(input) {
  if (!isPlainObject(input)) {
    return fail(REASON_CODES.REJECTED_REQUEST, 'Tool request must be a plain object.');
  }
  if (typeof input.tool !== 'string' || !ALLOWED_TOOL_SET.has(input.tool)) {
    return fail(REASON_CODES.REJECTED_REQUEST, 'Tool name is not allowlisted.');
  }
  const allowedKeys = REQUEST_KEYS[input.tool];
  if (!exactKeys(input, allowedKeys)) {
    return fail(REASON_CODES.REJECTED_REQUEST, 'Tool request has missing or unapproved fields.');
  }

  if (input.tool === TOOL_NAMES.GET_SESSION_SUMMARY) {
    if (!isOpaqueRef(input.session_ref)) {
      return fail(REASON_CODES.REJECTED_REQUEST, 'session_ref is not a safe opaque identifier.');
    }
    if (!isVersionToken(input.analysis_version)) {
      return fail(REASON_CODES.REJECTED_REQUEST, 'analysis_version is malformed.');
    }
    return ok({
      tool: input.tool,
      session_ref: input.session_ref,
      analysis_version: input.analysis_version,
    });
  }

  if (input.tool === TOOL_NAMES.COMPARE_SESSIONS) {
    if (!Array.isArray(input.session_refs) || input.session_refs.length < 2 || input.session_refs.length > MAX_SESSION_REFS) {
      return fail(REASON_CODES.REJECTED_REQUEST, 'session_refs must contain 2 to 8 opaque identifiers.');
    }
    if (new Set(input.session_refs).size !== input.session_refs.length) {
      return fail(REASON_CODES.REJECTED_REQUEST, 'session_refs must be unique.');
    }
    if (!input.session_refs.every(isOpaqueRef)) {
      return fail(REASON_CODES.REJECTED_REQUEST, 'A session_ref is not a safe opaque identifier.');
    }
    if (!ALLOWED_METRIC_SET.has(input.metric_id)) {
      return fail(REASON_CODES.REJECTED_REQUEST, 'metric_id is not allowlisted.');
    }
    if (!isVersionToken(input.analysis_version)) {
      return fail(REASON_CODES.REJECTED_REQUEST, 'analysis_version is malformed.');
    }
    return ok({
      tool: input.tool,
      session_refs: [...input.session_refs],
      metric_id: input.metric_id,
      analysis_version: input.analysis_version,
    });
  }

  if (!isOpaqueRef(input.artifact_ref)) {
    return fail(REASON_CODES.REJECTED_REQUEST, 'artifact_ref is not a safe opaque identifier.');
  }
  return ok({
    tool: input.tool,
    artifact_ref: input.artifact_ref,
  });
}

export function validateQuality(quality) {
  if (!isPlainObject(quality) || typeof quality.usable !== 'boolean' || !Array.isArray(quality.reason_codes)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'quality must include usable and reason_codes.');
  }
  if (quality.reason_codes.length > MAX_REASON_CODES || !quality.reason_codes.every((code) => isSafeString(code, 80))) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'quality.reason_codes is invalid.');
  }
  if (Object.keys(quality).length !== 2) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'quality has unexpected fields.');
  }
  return ok(quality);
}

export function validateToolResponse(input) {
  if (!isPlainObject(input)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Tool response must be a plain object.');
  }
  const required = [
    'contract_version',
    'tool',
    'status',
    'analysis_version',
    'data_origin',
    'quality',
    'metrics',
    'limitations',
  ];
  for (const key of required) {
    if (!(key in input)) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, `Tool response missing ${key}.`);
    }
  }
  if (input.contract_version !== CONTRACT_VERSION) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Unsupported contract_version.');
  }
  if (!ALLOWED_TOOL_SET.has(input.tool) && input.tool !== 'rejected') {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Tool response tool is not allowlisted.');
  }
  if (!TOOL_STATUS_VALUES.has(input.status)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Tool response status is invalid.');
  }
  if (input.analysis_version !== ANALYSIS_VERSION && input.status === TOOL_STATUS.OK) {
    return fail(REASON_CODES.UNKNOWN_ANALYSIS_VERSION, 'OK responses must use the supported analysis_version.');
  }
  if (!DATA_ORIGIN_VALUES.has(input.data_origin)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'data_origin must be synthetic_fixture in W1.');
  }
  const quality = validateQuality(input.quality);
  if (!quality.ok) return quality;
  if (!Array.isArray(input.metrics) || input.metrics.length > MAX_CLAIMS) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'metrics must be a bounded array.');
  }
  if (!Array.isArray(input.limitations) || !validateStringList(input.limitations, { maxItems: MAX_LIMITATIONS, allowEmpty: false })) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'limitations must be a non-empty string list.');
  }
  if (input.status === TOOL_STATUS.OK) {
    if (!isOpaqueRef(input.artifact_ref)) {
      return fail(REASON_CODES.MISSING_EVIDENCE, 'OK responses require an artifact_ref.');
    }
    if (!isVersionToken(input.protocol_version)) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'OK responses require protocol_version.');
    }
    if (!PARTICIPANT_SCOPE_VALUES.has(input.participant_scope)) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'OK responses require participant_scope.');
    }
    if (input.metrics.length === 0) {
      return fail(REASON_CODES.MISSING_EVIDENCE, 'OK responses must include metrics.');
    }
    if (input.reason_code !== undefined) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'OK responses must not include reason_code.');
    }
    for (const metric of input.metrics) {
      const checked = validateMetric(metric, { requireSessionRef: input.tool === TOOL_NAMES.COMPARE_SESSIONS && !String(metric.metric_id).endsWith('_delta') });
      if (!checked.ok) return checked;
    }
  } else {
    if (!isSafeString(input.reason_code, 80)) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'Non-OK responses require reason_code.');
    }
    if (input.metrics.length !== 0) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'Non-OK responses must not fabricate metrics.');
    }
  }
  return ok(input);
}

export function validateProvenance(provenance) {
  if (!isPlainObject(provenance)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'provenance must be an object.');
  }
  const required = ['producer', 'producer_version', 'computation', 'immutable', 'inputs'];
  if (!required.every((key) => key in provenance)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'provenance is missing required fields.');
  }
  if (!isSafeString(provenance.producer, 80) || !isSafeString(provenance.producer_version, 40)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'provenance producer fields are invalid.');
  }
  if (provenance.computation !== 'deterministic_fixture_lookup') {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'W1 provenance computation must be deterministic_fixture_lookup.');
  }
  if (provenance.immutable !== true) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Evidence artifacts must be marked immutable.');
  }
  if (!Array.isArray(provenance.inputs) || !provenance.inputs.every(isOpaqueRef)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'provenance.inputs must be opaque refs.');
  }
  return ok(provenance);
}

export function validateEvidenceArtifact(input) {
  if (!isPlainObject(input)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Evidence artifact must be a plain object.');
  }
  const required = [
    'artifact_schema_version',
    'artifact_ref',
    'artifact_kind',
    'contract_version',
    'analysis_version',
    'protocol_version',
    'created_at',
    'data_origin',
    'participant_scope',
    'source_session_refs',
    'provenance',
    'quality',
    'payload',
    'limitations',
  ];
  for (const key of required) {
    if (!(key in input)) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, `Evidence artifact missing ${key}.`);
    }
  }
  if (input.artifact_schema_version !== ARTIFACT_SCHEMA_VERSION) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Unsupported artifact_schema_version.');
  }
  if (!isOpaqueRef(input.artifact_ref)) {
    return fail(REASON_CODES.REJECTED_REQUEST, 'artifact_ref is not a safe opaque identifier.');
  }
  if (!ARTIFACT_KIND_VALUES.has(input.artifact_kind)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'artifact_kind is invalid.');
  }
  if (input.contract_version !== CONTRACT_VERSION || input.analysis_version !== ANALYSIS_VERSION) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Artifact versions are unsupported.');
  }
  if (!isVersionToken(input.protocol_version) || !isIsoTimestamp(input.created_at)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Artifact protocol_version or created_at is invalid.');
  }
  if (!DATA_ORIGIN_VALUES.has(input.data_origin) || !PARTICIPANT_SCOPE_VALUES.has(input.participant_scope)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Artifact origin or participant_scope is invalid.');
  }
  if (!Array.isArray(input.source_session_refs) || !input.source_session_refs.every(isOpaqueRef)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'source_session_refs must be opaque identifiers.');
  }
  const provenance = validateProvenance(input.provenance);
  if (!provenance.ok) return provenance;
  const quality = validateQuality(input.quality);
  if (!quality.ok) return quality;
  if (!isPlainObject(input.payload) || !Array.isArray(input.payload.metrics)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'payload.metrics must be an array.');
  }
  for (const metric of input.payload.metrics) {
    const checked = validateMetric(metric, { requireSessionRef: input.artifact_kind === ARTIFACT_KIND.SESSION_COMPARISON && !String(metric.metric_id).endsWith('_delta') });
    if (!checked.ok) return checked;
  }
  if (!validateStringList(input.limitations, { maxItems: MAX_LIMITATIONS, allowEmpty: false })) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Artifact limitations are invalid.');
  }
  return ok(input);
}

const UNSUPPORTED_CLAIM_PATTERN = /\b(adhd|diagnos(?:e|is|ed)|clinical validation|medical (?:advice|diagnosis)|fatigue score|fatigue probability)\b/i;

export function containsUnsupportedClaimLanguage(text) {
  return typeof text === 'string' && UNSUPPORTED_CLAIM_PATTERN.test(text);
}

export function findMetricInArtifacts(metricId, artifactRefs, artifactsByRef, { value, unit, session_ref } = {}) {
  for (const ref of artifactRefs) {
    const artifact = artifactsByRef.get(ref);
    if (!artifact) continue;
    const match = artifact.payload?.metrics?.find((metric) => {
      if (metric.metric_id !== metricId) return false;
      if (value !== undefined && !Object.is(metric.value, value)) return false;
      if (unit !== undefined && metric.unit !== unit) return false;
      if (session_ref !== undefined && metric.session_ref !== session_ref) return false;
      return true;
    });
    if (match) return { artifact, metric: match, artifact_ref: ref };
  }
  return null;
}

export function validateAgentAnswer(input, artifacts = []) {
  if (!isPlainObject(input)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Agent answer must be a plain object.');
  }
  if (input.answer_version !== ANSWER_VERSION) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Unsupported answer_version.');
  }
  if (!ANSWER_STATUS_VALUES.has(input.status)) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Answer status is invalid.');
  }
  if (!Array.isArray(input.claims) || input.claims.length > MAX_CLAIMS) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'claims must be a bounded array.');
  }
  if (!validateStringList(input.limitations, { maxItems: MAX_LIMITATIONS, allowEmpty: false })) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Answer limitations are invalid.');
  }

  const artifactsByRef = new Map();
  for (const artifact of artifacts) {
    const checked = validateEvidenceArtifact(artifact);
    if (!checked.ok) return checked;
    artifactsByRef.set(artifact.artifact_ref, artifact);
  }

  if (input.status === ANSWER_STATUS.ABSTAINED) {
    if (input.claims.length !== 0) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'Abstained answers must not include claims.');
    }
    if (!isSafeString(input.reason_code, 80)) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'Abstained answers require reason_code.');
    }
    return ok(input);
  }

  if (input.claims.length === 0) {
    return fail(REASON_CODES.MISSING_EVIDENCE, 'Answered outputs require at least one grounded claim.');
  }
  if (input.reason_code !== undefined) {
    return fail(REASON_CODES.MALFORMED_OUTPUT, 'Answered outputs must not include reason_code.');
  }

  for (const claim of input.claims) {
    if (!isPlainObject(claim)) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'Each claim must be an object.');
    }
    if (!exactKeys(claim, ['text', 'metric_id', 'value', 'unit', 'artifact_refs'])) {
      return fail(REASON_CODES.MALFORMED_OUTPUT, 'Claim has missing or unexpected fields.');
    }
    if (!isSafeString(claim.text) || containsUnsupportedClaimLanguage(claim.text)) {
      return fail(REASON_CODES.UNSUPPORTED_CLAIM, 'Claim text is unsafe or clinically unsupported.');
    }
    if (!ALLOWED_METRIC_SET.has(claim.metric_id)) {
      return fail(REASON_CODES.UNKNOWN_METRIC, 'Claim metric_id is not allowlisted.');
    }
    if (claim.unit !== ALLOWED_METRICS[claim.metric_id].unit || !isFiniteNumber(claim.value)) {
      return fail(REASON_CODES.NUMERIC_MISMATCH, 'Claim value or unit is invalid.');
    }
    if (!Array.isArray(claim.artifact_refs) || claim.artifact_refs.length === 0 || !claim.artifact_refs.every(isOpaqueRef)) {
      return fail(REASON_CODES.MISSING_EVIDENCE, 'Claim artifact_refs must be opaque identifiers.');
    }
    if (claim.artifact_refs.some((ref) => !artifactsByRef.has(ref))) {
      return fail(REASON_CODES.MISSING_EVIDENCE, 'A cited artifact_ref was not returned by a tool.');
    }
    const grounded = findMetricInArtifacts(claim.metric_id, claim.artifact_refs, artifactsByRef, {
      value: claim.value,
      unit: claim.unit,
    });
    if (!grounded) {
      const sameMetric = findMetricInArtifacts(claim.metric_id, claim.artifact_refs, artifactsByRef);
      if (sameMetric) {
        return fail(REASON_CODES.NUMERIC_MISMATCH, 'Claim value or unit does not match the cited artifact.');
      }
      return fail(REASON_CODES.MISSING_EVIDENCE, 'Claim metric was not found in the cited artifacts.');
    }
  }
  return ok(input);
}
