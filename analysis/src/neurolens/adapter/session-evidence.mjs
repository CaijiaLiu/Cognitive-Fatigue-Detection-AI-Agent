/**
 * W3.2 offline session-evidence adapter.
 * Transforms supported V1 session JSON plus optional W3.1 local sidecars into
 * structured evidence for the existing Research Agent tools.
 * Not scientifically validated. Does not invent fatigue scores or change Caijia algorithms.
 */
import { createHash } from 'node:crypto';
import {
  ALLOWED_METRIC_IDS,
  COLLECTION_SCHEMA_V1,
  COMPUTATION,
  DATA_ORIGIN,
  PARTICIPANT_SCOPE,
  PROTOCOL_VERSIONS,
  REASON_CODES,
  SESSION_EVIDENCE_ANALYSIS_VERSION,
  SESSION_EVIDENCE_CONTRACT_VERSION,
  SESSION_EVIDENCE_LIMIT,
  SESSION_EVIDENCE_PRODUCER_ID,
  SOURCE_PROTOCOL_GO_NO_GO_V1,
  TOOL_STATUS,
} from '../agent/constants.mjs';
import { ARTIFACT_KIND } from '../agent/constants.mjs';
import { cloneJson, createEvidenceArtifact, deepFreeze, sessionAlias } from '../agent/artifacts.mjs';
import { createAnalysisTools } from '../agent/tools.mjs';
import { fail, isPlainObject, ok } from '../agent/validate.mjs';
import {
  PROTOCOL_CONTRACT_ID,
  RESEARCH_EVENT_CONTRACT_ID,
  RESEARCH_EVENT_CONTRACT_VERSION,
  V1_GO_NO_GO_PROTOCOL,
  validateResearchEvent,
} from '../../../../public/collection/session/protocol.js';
import { MISSION_EVENT_CONTRACT, readCompatibleSession } from '../../../../public/collection/session/mission-adapter.js';
import {
  readMissionSidecar,
  readOrchestrationSidecar,
  replayOrchestration,
  stableStringify,
} from '../../../../public/collection/session/orchestration-export.js';
import { validateV1Session } from './validate-export.mjs';
import { ingestError, normalizeAcceptedSession, redactSession } from './normalize.mjs';

const MODES = new Set(['camera', 'simulated', 'behavior']);
const STATUSES = new Set(['completed', 'interrupted', 'failed']);
const GENERIC_PROTOCOL_ID = 'research-session-sequence/0.1-provisional';
const VISION_BY_MODE = Object.freeze({
  camera: 'camera',
  simulated: 'simulated',
  behavior: 'unavailable',
});

export const SESSION_EVIDENCE_CONTRACT = Object.freeze({
  contract_id: SESSION_EVIDENCE_CONTRACT_VERSION,
  contract_version: '0.1.0',
  analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
  scientific_review: 'PENDING_SCIENTIFIC_REVIEW',
  local_only: true,
  upload_eligible: false,
  data_origin: DATA_ORIGIN.SESSION_ORCHESTRATION,
  accepts: Object.freeze([
    'V1 sessions with schema_version 1.0.0',
    'optional research-session/0.1-provisional sidecar',
    'optional mission-event/0.1-provisional sidecar',
  ]),
  rejects: Object.freeze([
    'mission-preview-1',
    'unknown schema or contract versions',
    'generic slots interpreted as PVT or Go/No-Go science',
    'preview coercion into V1',
    'implicit upload of orchestration or biomedical sidecars',
    'orchestration timelines that fail event-only replay',
    'conflicting duplicate session_ref records',
  ]),
});

function rejected(reason_code, message, status = TOOL_STATUS.UNAVAILABLE) {
  return { ...fail(reason_code, message), status };
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unwrapInput(input) {
  if (!isPlainObject(input)) return { session: input, orchestration: null, mission: null };
  if (isPlainObject(input.session)) {
    return {
      session: input.session,
      orchestration: input.orchestration ?? input.session.orchestration ?? null,
      mission: input.mission ?? input.session.mission ?? null,
    };
  }
  return {
    session: input,
    orchestration: input.orchestration ?? null,
    mission: input.mission ?? null,
  };
}

function analysisProtocolVersion(protocolId) {
  if (protocolId === SOURCE_PROTOCOL_GO_NO_GO_V1 || protocolId === 'go-no-go-v1') {
    return PROTOCOL_VERSIONS.GO_NO_GO_V1;
  }
  if (protocolId === GENERIC_PROTOCOL_ID) {
    return PROTOCOL_VERSIONS.RESEARCH_SEQUENCE_V01;
  }
  return null;
}

function sessionSource(mode) {
  if (mode === 'camera') return 'camera';
  if (mode === 'simulated') return 'simulated';
  return 'task-only';
}

function expectedVision(mode) {
  return VISION_BY_MODE[mode];
}

function evidenceRef(sessionId, ...parts) {
  return ['evidence', sessionId, ...parts.map((part) => String(part).replace(/[^a-z0-9._-]/gi, '-').toLowerCase())].join(':');
}

function sessionRefFor(sessionId) {
  return `evidence:session:${sessionId}`;
}

function stripLocalSidecars(session) {
  const copy = cloneJson(session);
  delete copy.orchestration;
  delete copy.mission;
  return deepFreeze(copy);
}

function summaryRefFor(sessionId) {
  return `evidence:session-summary:${sessionId}`;
}

function originalArtifactRef(sessionId, orchestrationPresent) {
  return orchestrationPresent ? `session:orchestration:${sessionId}` : `session:v1:${sessionId}`;
}

function validateIdentity(session) {
  if (!isPlainObject(session)) {
    return rejected(REASON_CODES.REJECTED_REQUEST, 'Session evidence input must be a plain object.');
  }
  const compatibility = readCompatibleSession(session);
  if (!compatibility.compatible) {
    return rejected(
      compatibility.kind === 'mission-preview' ? REASON_CODES.INCOMPATIBLE_PROTOCOL : REASON_CODES.UNSUPPORTED_SCHEMA,
      compatibility.reason || 'Session schema is unsupported.',
      TOOL_STATUS.INCOMPATIBLE,
    );
  }
  if (session.schema_version !== COLLECTION_SCHEMA_V1) {
    return rejected(
      session.schema_version ? REASON_CODES.UNSUPPORTED_SCHEMA : REASON_CODES.MALFORMED_OUTPUT,
      'Only collection schema 1.0.0 is accepted.',
      session.schema_version ? TOOL_STATUS.INCOMPATIBLE : TOOL_STATUS.UNAVAILABLE,
    );
  }
  if (session.mode === 'demo') {
    return rejected(REASON_CODES.REJECTED_REQUEST, 'Demo sessions are rejected before evidence construction.');
  }
  if (!MODES.has(session.mode) || !STATUSES.has(session.status)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Session mode or status is not a supported V1 value.');
  }
  if (typeof session.session_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(session.session_id)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'session_id must be a UUID.');
  }
  if (typeof session.started_at !== 'string' || typeof session.ended_at !== 'string'
    || !Number.isFinite(Date.parse(session.started_at)) || !Number.isFinite(Date.parse(session.ended_at))) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Session timestamps are missing or invalid.');
  }
  if (!isPlainObject(session.sources) || session.sources.vision !== expectedVision(session.mode)) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'sources.vision does not match mode.', TOOL_STATUS.INCOMPATIBLE);
  }
  if (session.sources.behavior === 'simulated' || session.sources.ratings === 'simulated') {
    return rejected(REASON_CODES.REJECTED_REQUEST, 'Simulated behavior or ratings are not accepted.');
  }
  if (session.samples !== undefined) {
    if (!Array.isArray(session.samples)) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, 'samples must be an array when present.');
    }
    if (session.samples.some((sample) => sample?.source !== session.sources.vision)) {
      return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'A visual sample source disagrees with sources.vision.', TOOL_STATUS.INCOMPATIBLE);
    }
  }
  return null;
}

function validateOrchestration(session, orchestration) {
  const read = readOrchestrationSidecar(orchestration);
  if (!read.ok) {
    const incompatible = /unsupported|unknown|version/i.test(read.reason || read.kind || '');
    return rejected(
      incompatible ? REASON_CODES.UNSUPPORTED_SCHEMA : REASON_CODES.MALFORMED_OUTPUT,
      read.reason || 'Orchestration sidecar is invalid.',
      incompatible ? TOOL_STATUS.INCOMPATIBLE : TOOL_STATUS.UNAVAILABLE,
    );
  }
  const snap = read.orchestration;
  if (!snap) return { ok: true, orchestration: null };

  if (snap.session_id !== session.session_id) {
    return rejected(REASON_CODES.SESSION_MISMATCH, 'Orchestration session_id does not match the V1 session.');
  }
  if (snap.contract_id !== 'research-session/0.1-provisional') {
    return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Unsupported orchestration contract.', TOOL_STATUS.INCOMPATIBLE);
  }
  if (snap.contract_version !== '0.1.0') {
    return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Unsupported orchestration contract_version.', TOOL_STATUS.INCOMPATIBLE);
  }
  if (snap.scientific_review !== 'v1-existing' && snap.scientific_review !== 'PENDING_SCIENTIFIC_REVIEW') {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Orchestration scientific_review is missing or unsupported.');
  }
  if (!isPlainObject(snap.protocol) || snap.protocol.contract_id !== PROTOCOL_CONTRACT_ID) {
    return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Unsupported protocol contract.', TOOL_STATUS.INCOMPATIBLE);
  }
  if (snap.protocol.contract_version !== '0.1.0') {
    return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Unsupported protocol contract_version.', TOOL_STATUS.INCOMPATIBLE);
  }
  const protocolId = snap.protocol.protocol_id;
  if (!analysisProtocolVersion(protocolId)) {
    return rejected(REASON_CODES.INCOMPATIBLE_PROTOCOL, 'Protocol id is not a supported evidence source.', TOOL_STATUS.INCOMPATIBLE);
  }
  const configured = session.config?.protocol;
  if (configured && configured !== protocolId) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Session config.protocol does not match the orchestration protocol.', TOOL_STATUS.INCOMPATIBLE);
  }
  const taskIds = new Set((snap.protocol.tasks || []).map((task) => task.task_id));
  if (taskIds.size === 0) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Orchestration protocol has no tasks.');
  }
  for (const task of snap.tasks || []) {
    if (task?.task_id && !taskIds.has(task.task_id)) {
      return rejected(REASON_CODES.SESSION_MISMATCH, `Task ${task.task_id} is not a member of the protocol.`);
    }
  }
  if (!Array.isArray(snap.events)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Orchestration events must be an array.');
  }
  for (const event of snap.events) {
    if (!event || event.contract_id !== RESEARCH_EVENT_CONTRACT_ID) {
      return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Event contract_id is unsupported.', TOOL_STATUS.INCOMPATIBLE);
    }
    if (event.contract_version !== RESEARCH_EVENT_CONTRACT_VERSION) {
      return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Event contract_version is unsupported.', TOOL_STATUS.INCOMPATIBLE);
    }
    if (event.session_id !== session.session_id) {
      return rejected(REASON_CODES.SESSION_MISMATCH, 'An event session_id does not match the V1 session.');
    }
    const checked = validateResearchEvent(event, { taskIds });
    if (!checked.ok) {
      return rejected(
        checked.reason === 'task_membership' ? REASON_CODES.SESSION_MISMATCH : REASON_CODES.MALFORMED_OUTPUT,
        `Event ${event.type || 'unknown'} failed validation (${checked.reason}).`,
      );
    }
  }
  if (protocolId === GENERIC_PROTOCOL_ID && Array.isArray(session.trials) && session.trials.some((trial) => trial?.type === 'go' || trial?.type === 'no-go')) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Generic-slot sessions cannot carry Go/No-Go trial records.', TOOL_STATUS.INCOMPATIBLE);
  }
  if (STATUSES.has(session.status) && snap.state && session.status !== snap.state) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'V1 session status does not match orchestration state.');
  }
  return validateOrchestrationTimeline(session, snap);
}

function declaredTasks(tasks) {
  return (tasks || []).map((task) => ({
    task_id: task.task_id ?? null,
    started_session_ms: Number.isFinite(task.started_session_ms) ? task.started_session_ms : null,
    ended_session_ms: Number.isFinite(task.ended_session_ms) ? task.ended_session_ms : null,
    reason: task.reason ?? null,
  }));
}

function observationOutsideTask(event, tasks) {
  if (event.type !== 'observation' && event.type !== 'dropout') return false;
  if (event.task_id == null) return event.type === 'observation';
  const task = (tasks || []).find((item) => item.task_id === event.task_id);
  if (!task || !Number.isFinite(task.started_session_ms)) return true;
  const at = Number.isFinite(event.acquired_elapsed_ms) ? event.acquired_elapsed_ms : event.session_elapsed_ms;
  if (!Number.isFinite(at)) return event.type === 'observation';
  if (at < task.started_session_ms) return true;
  if (Number.isFinite(task.ended_session_ms) && at >= task.ended_session_ms) return true;
  return false;
}

function validateOrchestrationTimeline(session, snap) {
  const original = cloneJson(snap);
  const replayed = replayOrchestration({ orchestration: cloneJson(snap) });
  if (stableStringify(snap) !== stableStringify(original)) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Orchestration replay mutated the submitted sidecar.');
  }
  if (!replayed.replay || replayed.replay.ok !== true) {
    return rejected(
      replayed.replay?.reason === 'session_mismatch' ? REASON_CODES.SESSION_MISMATCH : REASON_CODES.INCONSISTENT_EVIDENCE,
      `Orchestration timeline replay failed (${replayed.replay?.reason || 'replay_failed'}).`,
    );
  }
  if (replayed.replay.measurement_fidelity !== false || replayed.replay.kind !== 'event_only') {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Evidence adapter requires event-only replay with measurement_fidelity false.');
  }
  if (replayed.session_id !== session.session_id || replayed.session_id !== snap.session_id) {
    return rejected(REASON_CODES.SESSION_MISMATCH, 'Replayed session identity does not match the V1 session.');
  }
  if (replayed.state !== snap.state) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Replayed terminal state does not match the sidecar.');
  }
  const replayedSnap = replayed.snapshot();
  if (stableStringify(declaredTasks(replayedSnap.tasks)) !== stableStringify(declaredTasks(snap.tasks))) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Replayed task boundaries do not match the sidecar.');
  }
  for (const event of snap.events || []) {
    if (observationOutsideTask(event, replayedSnap.tasks)) {
      return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'An observation or dropout occurs outside an active task.');
    }
  }
  return { ok: true, orchestration: snap };
}

function validateMission(session, mission) {
  const read = readMissionSidecar(mission);
  if (!read.ok) {
    return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, read.reason || 'Mission sidecar is invalid.', TOOL_STATUS.INCOMPATIBLE);
  }
  if (!read.mission) return { ok: true, mission: null };
  if (read.mission.contract_id !== MISSION_EVENT_CONTRACT.contract_id) {
    return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Unsupported mission contract.', TOOL_STATUS.INCOMPATIBLE);
  }
  if (read.mission.scientific_review && read.mission.scientific_review !== 'PENDING_SCIENTIFIC_REVIEW' && read.mission.scientific_review !== 'v1-existing') {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Mission scientific_review is unsupported.');
  }
  return { ok: true, mission: read.mission };
}

export function validateSessionEvidenceInput(input) {
  const { session, orchestration, mission } = unwrapInput(input);
  const identity = validateIdentity(session);
  if (identity) return identity;

  const orchestrationCheck = validateOrchestration(session, orchestration);
  if (!orchestrationCheck.ok) return orchestrationCheck;

  const missionCheck = validateMission(session, mission);
  if (!missionCheck.ok) return missionCheck;

  const protocolId = orchestrationCheck.orchestration?.protocol?.protocol_id || session.config?.protocol;
  if (!orchestrationCheck.orchestration) {
    const v1 = validateV1Session(session);
    if (!v1.ok) return { ...v1, status: v1.status || TOOL_STATUS.UNAVAILABLE };
  } else if (protocolId === SOURCE_PROTOCOL_GO_NO_GO_V1) {
    const v1 = validateV1Session(session);
    if (!v1.ok) return { ...v1, status: v1.status || TOOL_STATUS.UNAVAILABLE };
  } else if (protocolId !== GENERIC_PROTOCOL_ID) {
    return rejected(REASON_CODES.INCOMPATIBLE_PROTOCOL, 'Only go-no-go-v1 or the provisional sequence protocol can be adapted.', TOOL_STATUS.INCOMPATIBLE);
  }

  return ok({
    session,
    orchestration: orchestrationCheck.orchestration,
    mission: missionCheck.mission,
    protocol_id: protocolId || SOURCE_PROTOCOL_GO_NO_GO_V1,
  });
}

function item({
  sessionId,
  protocolId,
  protocolVersion,
  taskId,
  type,
  key,
  value = null,
  unit = null,
  window = null,
  source,
  qualityStatus,
  reasonCodes = [],
  missingness = false,
  scientificReview,
  artifactRef,
}) {
  return {
    evidence_id: evidenceRef(sessionId, type, taskId || 'session', key),
    session_id: sessionId,
    protocol_id: protocolId,
    protocol_version: protocolVersion,
    task_id: taskId || null,
    evidence_type: type,
    value: value === undefined ? null : value,
    unit,
    window,
    source,
    quality: {
      status: qualityStatus,
      missingness,
      reason_codes: [...reasonCodes],
    },
    scientific_review: scientificReview,
    evidence_contract_version: SESSION_EVIDENCE_CONTRACT_VERSION,
    artifact_ref: artifactRef,
  };
}

function taskSequenceFrom(session, orchestration, protocolId) {
  if (orchestration?.tasks?.length) {
    return orchestration.tasks.map((task) => ({
      task_id: task.task_id,
      kind: task.kind || null,
      protocol_id: task.protocol_id || protocolId,
      scientific_review: task.scientific_review || orchestration.scientific_review,
      window: {
        start_ms: Number.isFinite(task.started_session_ms) ? task.started_session_ms : null,
        end_ms: Number.isFinite(task.ended_session_ms) ? task.ended_session_ms : null,
      },
    }));
  }
  if (protocolId === SOURCE_PROTOCOL_GO_NO_GO_V1) {
    return [{
      task_id: 'go-no-go',
      kind: 'go-no-go',
      protocol_id: SOURCE_PROTOCOL_GO_NO_GO_V1,
      scientific_review: 'v1-existing',
      window: {
        start_ms: 0,
        end_ms: Number.isFinite(session.duration_ms) ? session.duration_ms : null,
      },
    }];
  }
  return (V1_GO_NO_GO_PROTOCOL.tasks || []).map((task) => ({
    task_id: task.task_id,
    kind: task.kind,
    protocol_id: task.protocol_id,
    scientific_review: task.scientific_review,
    window: { start_ms: null, end_ms: null },
  }));
}

function buildEvidenceItems(session, orchestration, protocolId, scientificReview) {
  const sessionId = session.session_id;
  const protocolVersion = analysisProtocolVersion(protocolId);
  const source = sessionSource(session.mode);
  const artifactRef = originalArtifactRef(sessionId, Boolean(orchestration));
  const sequence = taskSequenceFrom(session, orchestration, protocolId);
  const defaultTaskId = protocolId === SOURCE_PROTOCOL_GO_NO_GO_V1 ? 'go-no-go' : null;
  const items = [];

  items.push(item({
    sessionId,
    protocolId,
    protocolVersion,
    taskId: null,
    type: 'session_structure',
    key: 'task-sequence',
    value: sequence.length,
    unit: 'count',
    window: { start_ms: 0, end_ms: Number.isFinite(session.duration_ms) ? session.duration_ms : null },
    source,
    qualityStatus: 'valid',
    scientificReview,
    artifactRef,
  }));

  if (protocolId === SOURCE_PROTOCOL_GO_NO_GO_V1) {
    const summary = session.behavior_summary || {};
    const mapping = [
      ['median_reaction_ms', 'reaction_time_median_ms', 'ms'],
      ['accuracy', 'accuracy', 'proportion'],
      ['valid_trial_count', 'valid_trial_count', 'count'],
    ];
    for (const [field, metricId, unit] of mapping) {
      const raw = summary[field];
      const present = typeof raw === 'number' && Number.isFinite(raw);
      items.push(item({
        sessionId,
        protocolId,
        protocolVersion,
        taskId: defaultTaskId,
        type: present ? 'task_only_behavior' : 'missing_measurement',
        key: metricId,
        value: present ? raw : null,
        unit: present ? unit : null,
        source: 'task-only',
        qualityStatus: present ? 'valid' : 'missing',
        missingness: !present,
        reasonCodes: present ? [] : ['missing_measurement'],
        scientificReview: 'v1-existing',
        artifactRef,
      }));
    }
  }

  const samples = Array.isArray(session.samples) ? session.samples : [];
  if (session.mode === 'behavior' || session.sources.vision === 'unavailable') {
    items.push(item({
      sessionId,
      protocolId,
      protocolVersion,
      taskId: defaultTaskId,
      type: 'missing_measurement',
      key: 'eye_aspect_ratio',
      value: null,
      unit: null,
      source: 'task-only',
      qualityStatus: 'unavailable',
      missingness: true,
      reasonCodes: ['unavailable_vision', 'missing_eye_measurement'],
      scientificReview,
      artifactRef,
    }));
  } else if (samples.length === 0) {
    items.push(item({
      sessionId,
      protocolId,
      protocolVersion,
      taskId: defaultTaskId,
      type: 'missing_measurement',
      key: 'eye_aspect_ratio',
      value: null,
      unit: null,
      source,
      qualityStatus: 'missing',
      missingness: true,
      reasonCodes: ['missing_eye_measurement'],
      scientificReview,
      artifactRef,
    }));
  }

  samples.forEach((sample, index) => {
    const earPresent = typeof sample.eye_aspect_ratio === 'number' && Number.isFinite(sample.eye_aspect_ratio);
    const dropout = sample.quality === 'tracking_gap' || sample.quality === 'no_face' || sample.face_present === false;
    const type = dropout
      ? 'tracking_dropout'
      : source === 'simulated'
        ? 'simulated_observation'
        : 'camera_observation';
    items.push(item({
      sessionId,
      protocolId,
      protocolVersion,
      taskId: defaultTaskId,
      type,
      key: `sample-${index}`,
      value: earPresent && !dropout ? sample.eye_aspect_ratio : null,
      unit: earPresent && !dropout ? 'ear_ratio' : null,
      window: {
        start_ms: Number.isFinite(sample.elapsed_ms) ? sample.elapsed_ms : null,
        end_ms: Number.isFinite(sample.elapsed_ms) ? sample.elapsed_ms : null,
      },
      source,
      qualityStatus: dropout ? 'dropout' : earPresent ? 'valid' : 'missing',
      missingness: !earPresent || dropout,
      reasonCodes: dropout ? ['tracking_dropout'] : earPresent ? [] : ['missing_eye_measurement'],
      scientificReview,
      artifactRef,
    }));
  });

  (orchestration?.events || []).forEach((event, index) => {
    if (event.type === 'observation') {
      const eventSource = event.source === 'camera' || event.source === 'simulated' ? event.source : 'task-only';
      items.push(item({
        sessionId,
        protocolId,
        protocolVersion,
        taskId: event.task_id,
        type: eventSource === 'simulated' ? 'simulated_observation' : eventSource === 'camera' ? 'camera_observation' : 'task_only_behavior',
        key: `event-${index}`,
        value: null,
        unit: null,
        window: {
          start_ms: event.acquired_elapsed_ms ?? event.session_elapsed_ms ?? null,
          end_ms: event.processed_elapsed_ms ?? event.session_elapsed_ms ?? null,
        },
        source: eventSource,
        qualityStatus: event.missingness ? 'missing' : 'valid',
        missingness: Boolean(event.missingness),
        reasonCodes: event.quality ? [String(event.quality)] : [],
        scientificReview: event.scientific_review || scientificReview,
        artifactRef,
      }));
    }
    if (event.type === 'dropout') {
      items.push(item({
        sessionId,
        protocolId,
        protocolVersion,
        taskId: event.task_id,
        type: 'tracking_dropout',
        key: `event-${index}`,
        value: null,
        unit: null,
        window: {
          start_ms: event.session_elapsed_ms ?? null,
          end_ms: event.session_elapsed_ms ?? null,
        },
        source: event.source === 'camera' || event.source === 'simulated' ? event.source : 'task-only',
        qualityStatus: 'dropout',
        missingness: true,
        reasonCodes: ['tracking_dropout', 'tracking_gap'],
        scientificReview: event.scientific_review || scientificReview,
        artifactRef,
      }));
    }
  });

  items.sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
  return items;
}

function limitationsFor({ session, protocolId, scientificReview, orchestration, items }) {
  const lines = [
    SESSION_EVIDENCE_LIMIT,
    'Numbers and evidence items are copied from supported session fields; no model inference was performed.',
    'Caijia has not confirmed new ocular or fatigue interpretations in this adapter.',
  ];
  if (scientificReview === 'PENDING_SCIENTIFIC_REVIEW' || protocolId === GENERIC_PROTOCOL_ID) {
    lines.push('The attached protocol is pending scientific review and is not clinically or scientifically validated.');
    lines.push('Generic task slots are not PVT, validated Go/No-Go, or fatigue measurements.');
  }
  if (session.mode === 'simulated' || session.sources.vision === 'simulated') {
    lines.push('Vision source is simulated; these observations are not camera evidence.');
  }
  if (session.mode === 'behavior' || session.sources.vision === 'unavailable') {
    lines.push('Vision was unavailable; ocular measurements stay missing and were not zero-filled.');
  }
  if (items.some((item) => item.evidence_type === 'tracking_dropout')) {
    lines.push('Tracking dropout is recorded as a gap, not as an open-eye observation.');
  }
  if (orchestration) {
    lines.push('W3.1 orchestration and mission sidecars remain local-only and are not upload-eligible.');
  }
  const sequence = taskSequenceFrom(session, orchestration, protocolId).map((task) => task.task_id).filter(Boolean);
  if (sequence.length > 0) {
    lines.push(`Task sequence: ${sequence.join(', ')}.`);
  }
  return lines.slice(0, 16);
}

function qualityFor(session, metrics, items, scientificReview) {
  const reason_codes = [];
  if (session.sources.vision === 'simulated') reason_codes.push('simulated_vision');
  if (session.sources.vision === 'unavailable') reason_codes.push('unavailable_vision');
  if (metrics.length === 0) reason_codes.push('missing_feature');
  if (scientificReview === 'PENDING_SCIENTIFIC_REVIEW') reason_codes.push('pending_scientific_review');
  if (items.some((item) => item.evidence_type === 'missing_measurement')) reason_codes.push('missing_eye_measurement');
  if (items.some((item) => item.evidence_type === 'tracking_dropout')) reason_codes.push('tracking_dropout');
  return {
    usable: metrics.length > 0,
    reason_codes,
  };
}

function copyV1Metrics(session, protocolId, sourceSha) {
  if (protocolId !== SOURCE_PROTOCOL_GO_NO_GO_V1) {
    return { metrics: [], ingest_error: null, normalized: null };
  }
  const normalized = normalizeAcceptedSession(session, { source_export_sha256: sourceSha });
  return {
    metrics: normalized.ingest_error ? [] : normalized.metrics,
    ingest_error: normalized.ingest_error || null,
    normalized,
  };
}

export function adaptSessionEvidence(input) {
  const checked = validateSessionEvidenceInput(input);
  if (!checked.ok) return checked;
  const { session, orchestration, mission, protocol_id: protocolId } = checked.value;
  const frozenOriginal = deepFreeze(cloneJson({
    session,
    orchestration,
    mission,
  }));
  const sourceSha = sha256Json(frozenOriginal);
  const scientificReview = orchestration?.scientific_review
    || (protocolId === SOURCE_PROTOCOL_GO_NO_GO_V1 ? 'v1-existing' : 'PENDING_SCIENTIFIC_REVIEW');
  const copied = copyV1Metrics(session, protocolId, sourceSha);
  if (copied.ingest_error) {
    return {
      ok: true,
      value: {
        session_ref: sessionRefFor(session.session_id),
        session_id: session.session_id,
        protocol_version: analysisProtocolVersion(protocolId),
        source_protocol: protocolId,
        collection_schema_version: COLLECTION_SCHEMA_V1,
        analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
        participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
        quality: { usable: false, reason_codes: [copied.ingest_error.reason_code] },
        metrics: [],
        evidence_items: [],
        task_sequence: [],
        limitations: [SESSION_EVIDENCE_LIMIT, ...copied.ingest_error.limitations],
        created_at: new Date(session.ended_at).toISOString(),
        source_export_sha256: sourceSha,
        scientific_review: scientificReview,
        source_provenance: sessionSource(session.mode),
        orchestration_present: Boolean(orchestration),
        local_only: true,
        upload_eligible: false,
        redacted: stripLocalSidecars(redactSession(session)),
        ingest_error: copied.ingest_error,
        original: frozenOriginal,
      },
    };
  }

  const items = buildEvidenceItems(session, orchestration, protocolId, scientificReview);
  const ids = items.map((entry) => entry.evidence_id);
  if (new Set(ids).size !== ids.length) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Evidence IDs collided within one session.');
  }
  const sequence = taskSequenceFrom(session, orchestration, protocolId);
  const metrics = copied.metrics;
  return ok({
    session_ref: sessionRefFor(session.session_id),
    session_id: session.session_id,
    protocol_version: analysisProtocolVersion(protocolId),
    source_protocol: protocolId,
    collection_schema_version: COLLECTION_SCHEMA_V1,
    analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
    participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
    quality: qualityFor(session, metrics, items, scientificReview),
    metrics,
    evidence_items: items,
    task_sequence: sequence,
    limitations: limitationsFor({ session, protocolId, scientificReview, orchestration, items }),
    created_at: new Date(session.ended_at).toISOString(),
    source_export_sha256: sourceSha,
    scientific_review: scientificReview,
    source_provenance: sessionSource(session.mode),
    orchestration_present: Boolean(orchestration),
    local_only: true,
    upload_eligible: false,
    missing_measurements: items
      .filter((entry) => entry.quality.missingness || entry.evidence_type === 'missing_measurement')
      .map((entry) => entry.evidence_id),
    redacted: stripLocalSidecars(redactSession(session)),
    ingest_error: null,
    original: frozenOriginal,
  });
}

function extraPayload(adapted, extras = {}) {
  return {
    analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
    collection_schema_version: adapted.collection_schema_version,
    source_protocol: adapted.source_protocol,
    source_export_sha256: adapted.source_export_sha256,
    evidence_items: adapted.evidence_items,
    task_sequence: adapted.task_sequence,
    evidence_contract_version: SESSION_EVIDENCE_CONTRACT_VERSION,
    scientific_review: adapted.scientific_review,
    source_provenance: adapted.source_provenance,
    missing_measurements: adapted.missing_measurements || [],
    orchestration_present: adapted.orchestration_present,
    local_only: true,
    ...extras,
  };
}

function buildSummaryArtifact(adapted) {
  return createEvidenceArtifact({
    artifact_ref: summaryRefFor(adapted.session_id),
    artifact_kind: ARTIFACT_KIND.SESSION_SUMMARY,
    protocol_version: adapted.protocol_version,
    created_at: adapted.created_at,
    participant_scope: adapted.participant_scope,
    source_session_refs: [adapted.session_ref],
    quality: adapted.quality,
    metrics: adapted.metrics,
    limitations: adapted.limitations,
    analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
    data_origin: DATA_ORIGIN.SESSION_ORCHESTRATION,
    computation: COMPUTATION.SESSION_EVIDENCE_ADAPTATION,
    producer: SESSION_EVIDENCE_PRODUCER_ID,
    provenance_extra: {
      source_protocol: adapted.source_protocol,
      scientific_review: adapted.scientific_review,
      local_only: true,
    },
    extra_payload: extraPayload(adapted),
  });
}

function buildComparisonArtifact(sessions, metricId) {
  const metrics = sessions.map((session) => {
    const metric = session.metrics.find((item) => item.metric_id === metricId);
    return {
      metric_id: metric.metric_id,
      value: metric.value,
      unit: metric.unit,
      n: metric.n,
      session_ref: session.session_ref,
    };
  });
  const reasonCodes = [...new Set(sessions.flatMap((session) => session.quality.reason_codes))];
  return createEvidenceArtifact({
    artifact_ref: `evidence:compare:${sessions.map((session) => sessionAlias(session.session_ref).replace(/^evidence:session:/, '')).join(':')}:${metricId}`,
    artifact_kind: ARTIFACT_KIND.SESSION_COMPARISON,
    protocol_version: sessions[0].protocol_version,
    created_at: sessions.map((session) => session.created_at).sort()[0],
    participant_scope: PARTICIPANT_SCOPE.TWO_PSEUDONYMOUS,
    source_session_refs: sessions.map((session) => session.session_ref),
    quality: { usable: true, reason_codes: reasonCodes },
    metrics,
    limitations: [
      ...sessions[0].limitations,
      'Comparison is descriptive only; no causal or diagnostic claim.',
    ].slice(0, 16),
    analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
    data_origin: DATA_ORIGIN.SESSION_ORCHESTRATION,
    computation: COMPUTATION.SESSION_EVIDENCE_ADAPTATION,
    producer: SESSION_EVIDENCE_PRODUCER_ID,
    provenance_extra: {
      source_protocol: sessions[0].source_protocol,
      local_only: true,
    },
    extra_payload: extraPayload(sessions[0], { metric_id: metricId }),
  });
}

function comparable(left, right) {
  if (left.ingest_error || right.ingest_error) return false;
  if (!left.quality.usable || !right.quality.usable) return false;
  if (left.protocol_version !== right.protocol_version) return false;
  const leftSim = left.quality.reason_codes.includes('simulated_vision');
  const rightSim = right.quality.reason_codes.includes('simulated_vision');
  return leftSim === rightSim;
}

function rejectedStub(input, failure) {
  const wrapped = unwrapInput(input);
  const sessionId = isPlainObject(wrapped.session) && typeof wrapped.session.session_id === 'string'
    ? wrapped.session.session_id
    : null;
  const session_ref = sessionId && /^[a-f0-9-]{36}$/i.test(sessionId) ? sessionRefFor(sessionId) : null;
  return {
    session_ref,
    session_id: sessionId,
    protocol_version: undefined,
    source_protocol: wrapped.session?.config?.protocol,
    collection_schema_version: wrapped.session?.schema_version,
    analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
    participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
    quality: { usable: false, reason_codes: [failure.reason_code] },
    metrics: [],
    evidence_items: [],
    task_sequence: [],
    limitations: [SESSION_EVIDENCE_LIMIT, failure.message],
    created_at: '2026-10-19T00:00:00.000Z',
    scientific_review: 'PENDING_SCIENTIFIC_REVIEW',
    source_provenance: 'task-only',
    orchestration_present: false,
    local_only: true,
    upload_eligible: false,
    redacted: null,
    ingest_error: ingestError(failure.status || TOOL_STATUS.UNAVAILABLE, failure.reason_code, [failure.message]),
  };
}

export function createSessionEvidenceStore(input) {
  const documents = Array.isArray(input) ? input : [input];
  const sessions = Object.create(null);
  const artifacts = Object.create(null);
  const summaryRefs = Object.create(null);
  const comparisonRefs = Object.create(null);
  const rejections = [];

  for (const document of documents) {
    const adapted = adaptSessionEvidence(document);
    const record = adapted.ok ? adapted.value : rejectedStub(document, adapted);
    if (adapted.ok === false) {
      rejections.push({
        session_id: record.session_id,
        reason_code: adapted.reason_code,
        message: adapted.message,
        status: adapted.status,
      });
    }
    if (!record.session_ref) continue;
    if (Object.hasOwn(sessions, record.session_ref)) {
      const existing = sessions[record.session_ref];
      const sameHash = existing.source_export_sha256
        && record.source_export_sha256
        && existing.source_export_sha256 === record.source_export_sha256;
      const sameRejection = Boolean(existing.ingest_error)
        && Boolean(record.ingest_error)
        && existing.ingest_error.reason_code === record.ingest_error.reason_code
        && existing.ingest_error.limitations?.[0] === record.ingest_error.limitations?.[0];
      if ((sameHash && !existing.ingest_error && !record.ingest_error) || sameRejection) {
        continue;
      }
      rejections.push({
        session_id: record.session_id,
        reason_code: REASON_CODES.INCONSISTENT_EVIDENCE,
        message: 'Conflicting duplicate session_ref.',
        status: TOOL_STATUS.UNAVAILABLE,
      });
      delete artifacts[summaryRefFor(record.session_id)];
      sessions[record.session_ref] = deepFreeze({
        ...rejectedStub(document, rejected(
          REASON_CODES.INCONSISTENT_EVIDENCE,
          'Conflicting duplicate session_ref.',
        )),
        session_ref: record.session_ref,
        session_id: record.session_id,
      });
      summaryRefs[record.session_ref] = summaryRefFor(record.session_id);
      continue;
    }
    sessions[record.session_ref] = deepFreeze(record);
    summaryRefs[record.session_ref] = summaryRefFor(record.session_id);
    if (!record.ingest_error) {
      artifacts[summaryRefFor(record.session_id)] = buildSummaryArtifact(record);
    }
  }

  const usable = Object.values(sessions).filter((session) => !session.ingest_error && session.quality.usable);
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      if (!comparable(usable[i], usable[j])) continue;
      for (const metricId of ALLOWED_METRIC_IDS) {
        if (!usable[i].metrics.some((metric) => metric.metric_id === metricId)) continue;
        if (!usable[j].metrics.some((metric) => metric.metric_id === metricId)) continue;
        const artifact = buildComparisonArtifact([usable[i], usable[j]], metricId);
        artifacts[artifact.artifact_ref] = artifact;
        comparisonRefs[`${usable[i].session_ref}|${usable[j].session_ref}|${metricId}`] = artifact.artifact_ref;
        comparisonRefs[`${usable[j].session_ref}|${usable[i].session_ref}|${metricId}`] = artifact.artifact_ref;
      }
    }
  }

  return Object.freeze({
    analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
    data_origin: DATA_ORIGIN.SESSION_ORCHESTRATION,
    access: 'offline_session_evidence',
    limit: SESSION_EVIDENCE_LIMIT,
    local_only: true,
    upload_eligible: false,
    rejections: deepFreeze(rejections),
    getSession(sessionRef) {
      return Object.hasOwn(sessions, sessionRef) ? cloneJson(sessions[sessionRef]) : null;
    },
    hasSession(sessionRef) {
      return Object.hasOwn(sessions, sessionRef);
    },
    getArtifact(artifactRef) {
      return Object.hasOwn(artifacts, artifactRef) ? cloneJson(artifacts[artifactRef]) : null;
    },
    hasArtifact(artifactRef) {
      return Object.hasOwn(artifacts, artifactRef);
    },
    summaryRefFor(sessionRef) {
      return summaryRefs[sessionRef] ?? null;
    },
    comparisonRefFor(sessionRefs, metricId) {
      return comparisonRefs[`${sessionRefs.join('|')}|${metricId}`] ?? null;
    },
    listEvidence(sessionRef) {
      return sessions[sessionRef] ? cloneJson(sessions[sessionRef].evidence_items || []) : [];
    },
    getTaskSequence(sessionRef) {
      return sessions[sessionRef] ? cloneJson(sessions[sessionRef].task_sequence || []) : [];
    },
    compareWindows(sessionRef) {
      const session = sessions[sessionRef];
      if (!session) return null;
      const grouped = new Map();
      for (const entry of session.evidence_items || []) {
        const key = entry.task_id || 'session';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(entry.evidence_id);
      }
      return {
        session_ref: sessionRef,
        biomedical_comparison: false,
        note: 'Descriptive window listing only. Generic slots are not PVT or Go/No-Go science. No fatigue delta is computed.',
        windows: [...grouped.entries()].map(([task_id, evidence_ids]) => ({
          task_id,
          evidence_ids,
        })),
      };
    },
    listSessionRefs() {
      return Object.keys(sessions);
    },
  });
}

export function createSessionEvidenceTools(input) {
  const store = createSessionEvidenceStore(input);
  const tools = createAnalysisTools({ store });
  return Object.freeze({
    contract_version: tools.contract_version,
    analysis_version: tools.analysis_version,
    limit: SESSION_EVIDENCE_LIMIT,
    local_only: true,
    upload_eligible: false,
    invoke: tools.invoke,
    listTools: tools.listTools,
    allowedMetrics: tools.allowedMetrics,
    inspectArtifact: tools.inspectArtifact,
    invokeCount: tools.invokeCount,
    rejections: store.rejections,
    listEvidence: (sessionRef) => store.listEvidence(sessionRef),
    getTaskSequence: (sessionRef) => store.getTaskSequence(sessionRef),
    compareWindows: (sessionRef) => store.compareWindows(sessionRef),
    summaryArtifact: (sessionRef) => {
      const ref = store.summaryRefFor(sessionRef);
      return ref ? store.getArtifact(ref) : null;
    },
  });
}
