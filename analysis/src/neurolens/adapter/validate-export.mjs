/**
 * Fail-closed validation for already-exported Focus Lab / NeuroLens V1 JSON.
 * Offline only: the caller passes parsed JSON. No D1, camera, or filesystem glob.
 */
import { fail, isPlainObject, ok } from '../agent/validate.mjs';
import { COLLECTION_SCHEMA_V1, REASON_CODES, SOURCE_PROTOCOL_GO_NO_GO_V1 } from '../agent/constants.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MODES = new Set(['camera', 'simulated', 'behavior']);
const STATUSES = new Set(['completed', 'interrupted']);
const VISION_BY_MODE = Object.freeze({
  camera: 'camera',
  simulated: 'simulated',
  behavior: 'unavailable',
});

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

function rejected(reason_code, message, status = 'unavailable') {
  return { ...fail(reason_code, message), status };
}

function expectedVision(mode) {
  return VISION_BY_MODE[mode];
}

export function looksLikeCsv(value) {
  if (typeof value === 'string') {
    return /schema_version|session_id|participant_id/.test(value) && value.includes(',');
  }
  return false;
}

function validateSources(session) {
  if (!isPlainObject(session.sources)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Session sources are missing.');
  }
  const expected = expectedVision(session.mode);
  if (session.sources.vision !== expected) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'sources.vision does not match mode.', 'incompatible');
  }
  if (session.sources.behavior === 'simulated' || session.sources.ratings === 'simulated') {
    return rejected(REASON_CODES.REJECTED_REQUEST, 'Simulated behavior or ratings are not accepted as research exports.');
  }
  if (session.sources.behavior !== 'human' || session.sources.ratings !== 'self_report') {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Behavior and ratings sources must be human / self_report.');
  }
  return null;
}

function validateSampleSources(session) {
  if (session.samples === undefined) return null;
  if (!Array.isArray(session.samples)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'samples must be an array when present.');
  }
  const expected = session.sources.vision;
  if (session.samples.some((sample) => sample?.source !== expected)) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'A visual sample source disagrees with sources.vision.', 'incompatible');
  }
  return null;
}

export function validateV1Session(session) {
  if (!isPlainObject(session)) {
    return rejected(REASON_CODES.REJECTED_REQUEST, 'Session export must be a plain object.');
  }
  if (session.schema_version === 'mission-preview-1' || session.config?.protocol === 'mission-exploratory-v1') {
    return rejected(REASON_CODES.INCOMPATIBLE_PROTOCOL, 'Mission-preview records are unsupported.', 'incompatible');
  }
  if (session.schema_version !== COLLECTION_SCHEMA_V1) {
    return rejected(
      session.schema_version ? REASON_CODES.UNSUPPORTED_SCHEMA : REASON_CODES.MALFORMED_OUTPUT,
      'Only collection schema 1.0.0 is accepted.',
      session.schema_version ? 'incompatible' : 'unavailable',
    );
  }
  if (session.mode === 'demo') {
    return rejected(REASON_CODES.REJECTED_REQUEST, 'Demo sessions are rejected before artifact construction.');
  }
  if (!MODES.has(session.mode) || !STATUSES.has(session.status)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Session mode or status is not a supported V1 value.');
  }
  if (!isUuid(session.session_id) || !isUuid(session.participant_id)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Session identity fields are missing or malformed.');
  }
  if (typeof session.started_at !== 'string' || typeof session.ended_at !== 'string'
    || !Number.isFinite(Date.parse(session.started_at)) || !Number.isFinite(Date.parse(session.ended_at))) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Session timestamps are missing or invalid.');
  }
  if (!isPlainObject(session.config) || session.config.protocol !== SOURCE_PROTOCOL_GO_NO_GO_V1) {
    return rejected(REASON_CODES.INCOMPATIBLE_PROTOCOL, 'Only config.protocol go-no-go-v1 is accepted.', 'incompatible');
  }
  if (!isPlainObject(session.behavior_summary)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'behavior_summary is required.');
  }
  const sourceError = validateSources(session);
  if (sourceError) return sourceError;
  const sampleError = validateSampleSources(session);
  if (sampleError) return sampleError;
  return ok(session);
}

export function validateExport(input) {
  if (looksLikeCsv(input)) {
    return rejected(REASON_CODES.REJECTED_REQUEST, 'CSV exports are rejected; provide V1 session JSON.');
  }
  if (!isPlainObject(input)) {
    return rejected(REASON_CODES.REJECTED_REQUEST, 'Export must be a parsed V1 JSON object.');
  }
  if (Array.isArray(input.sessions)) {
    if (input.schema_version !== COLLECTION_SCHEMA_V1) {
      return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Export bundles must use schema_version 1.0.0.', 'incompatible');
    }
    if (input.sessions.length === 0) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Export bundle sessions[] is empty.');
    }
    const sessions = [];
    for (const session of input.sessions) {
      const checked = validateV1Session(session);
      if (!checked.ok) return checked;
      sessions.push(checked.value);
    }
    return ok({
      kind: 'bundle',
      sessions,
      exported_at: typeof input.exported_at === 'string' ? input.exported_at : null,
    });
  }
  const checked = validateV1Session(input);
  if (!checked.ok) return checked;
  return ok({
    kind: 'session',
    sessions: [checked.value],
    exported_at: null,
  });
}
