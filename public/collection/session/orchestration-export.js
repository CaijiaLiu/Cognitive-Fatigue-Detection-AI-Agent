import { readCompatibleSession } from './mission-adapter.js';
import { SCHEMA_VERSION } from './versions.js';
import {
  ORCHESTRATION_CONTRACT_ID,
  PROTOCOL_CONTRACT_ID,
  RESEARCH_EVENT_CONTRACT_ID,
  defineProtocol
} from './protocol.js';
import { createSessionOrchestrator } from './orchestrate.js';

export const SESSION_ARTIFACT_ID = 'research-session-artifact/0.1-provisional';

export const W4_SESSION_ADAPTER_CONTRACT = Object.freeze({
  contract_id: 'w4-session-artifact/0.1-provisional',
  contract_version: '0.1.0',
  scientific_review: 'PENDING_SCIENTIFIC_REVIEW',
  local_only: true,
  upload_eligible: false,
  accepts: Object.freeze([
    'V1 sessions with schema_version 1.0.0',
    'optional research-session/0.1-provisional sidecar',
    'optional mission-event/0.1-provisional sidecar'
  ]),
  rejects: Object.freeze([
    'mission-preview-1',
    'mission-exploratory-v1',
    'unknown schema_version',
    'silent coercion into V1'
  ]),
  preserves: Object.freeze([
    'schema_version 1.0.0',
    'collection vs upload consent',
    'missingness and quality flags',
    'camera / simulated / task-only provenance',
    'acquisition vs processing timestamps'
  ]),
  does_not_change: Object.freeze([
    'cloud sanitizeSession allowlist',
    'go-no-go-v1 trial semantics',
    'PVT outcomes or fatigue thresholds'
  ]),
  w4_prerequisites: Object.freeze([
    'Caijia-signed protocol ids before scientific window labels',
    'dataset builder that reads this artifact without rewriting V1',
    'participant/group split keys from V1 participant_id',
    'explicit consented upload path if any sidecar is ever stored remotely'
  ])
});

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function snapshotOf(input) {
  return typeof input?.snapshot === 'function' ? input.snapshot() : input;
}

export function serializeOrchestration(input) {
  const orchestration = snapshotOf(input);
  return sortKeys({
    artifact_id: SESSION_ARTIFACT_ID,
    artifact_version: '0.1.0',
    schema_version: SCHEMA_VERSION,
    contract_id: ORCHESTRATION_CONTRACT_ID,
    protocol_contract_id: PROTOCOL_CONTRACT_ID,
    event_contract_id: RESEARCH_EVENT_CONTRACT_ID,
    scientific_review: orchestration.scientific_review,
    local_only: true,
    upload_eligible: false,
    session_id: orchestration.session_id,
    mode: orchestration.mode,
    state: orchestration.state,
    orchestration
  });
}

export function attachLocalOrchestration(session, orchestrator) {
  if (!session || typeof session !== 'object') return session;
  orchestrator.mission.attachLocalMetadata(session);
  session.orchestration = orchestrator.snapshot();
  return session;
}

export function readSessionArtifact(session) {
  const base = readCompatibleSession(session);
  if (!base.compatible) {
    return { ...base, orchestration: null };
  }
  const orchestration = session.orchestration || null;
  if (!orchestration) {
    return { ...base, orchestration: null };
  }
  if (orchestration.contract_id !== ORCHESTRATION_CONTRACT_ID) {
    return {
      kind: 'unsupported-orchestration',
      compatible: false,
      coerced: false,
      orchestration: null,
      reason: 'unknown orchestration contract'
    };
  }
  return {
    ...base,
    orchestration,
    local_only: true,
    upload_eligible: false
  };
}

const TERMINAL_TYPES = new Set(['session_completed', 'session_interrupted', 'session_failed']);

export function replayOrchestration(artifact, { protocol = null } = {}) {
  const snap = artifact.orchestration || artifact;
  const resolved = protocol || defineProtocol(snap.protocol);
  let now = 0;
  const orch = createSessionOrchestrator({
    now: () => now,
    protocol: resolved,
    session_id: snap.session_id,
    mode: snap.mode
  });
  for (const event of snap.events || []) {
    if (event.type === 'resources_cleared') continue;
    const elapsed = Number.isFinite(event.session_elapsed_ms) ? event.session_elapsed_ms : 0;
    const processed = Number.isFinite(event.processed_elapsed_ms) ? event.processed_elapsed_ms : elapsed;
    now = processed;
    if (event.type === 'session_ready') {
      orch.prepare(now);
      continue;
    }
    if (event.type === 'session_started') {
      now = 0;
      orch.startSession({ startedAt: 0 });
      continue;
    }
    if (event.type === 'task_started') {
      orch.startTask(event.task_id, { startedAt: elapsed });
      continue;
    }
    if (event.type === 'task_ended') {
      orch.endTask(event.task_id, { reason: event.reason || 'completed', endedAt: elapsed });
      continue;
    }
    if (event.type === 'observation') {
      orch.recordObservation({
        acquisitionTs: event.acquired_elapsed_ms,
        processedTs: processed,
        source: event.source,
        quality: event.quality || 'valid'
      });
      continue;
    }
    if (event.type === 'dropout') {
      orch.recordDropout({ at: elapsed, source: event.source });
      continue;
    }
    if (event.type === 'session_completed') {
      orch.completeSession({ endedAt: elapsed });
      continue;
    }
    if (event.type === 'session_interrupted') {
      orch.interrupt({ reason: event.reason || 'interrupted', endedAt: elapsed });
      continue;
    }
    if (event.type === 'session_failed') {
      orch.fail({ reason: event.reason || 'failed', endedAt: elapsed });
      continue;
    }
    if (TERMINAL_TYPES.has(event.type)) {
      continue;
    }
  }
  return orch;
}
