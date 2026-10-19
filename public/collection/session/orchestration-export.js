import { MISSION_EVENT_CONTRACT, readCompatibleSession } from './mission-adapter.js';
import { SCHEMA_VERSION } from './versions.js';
import {
  ORCHESTRATION_CONTRACT_ID,
  PROTOCOL_CONTRACT_ID,
  RESEARCH_EVENT_CONTRACT_ID,
  V1_GO_NO_GO_PROTOCOL,
  defineProtocol
} from './protocol.js';
import { createSessionOrchestrator } from './orchestrate.js';

export const SESSION_ARTIFACT_ID = 'research-session-artifact/0.1-provisional';

export const ORCHESTRATION_REPLAY_CONTRACT = Object.freeze({
  kind: 'event_only',
  measurement_fidelity: false,
  contract_id: 'research-session-replay/0.1-provisional',
  guarantees: Object.freeze([
    'session state after the recorded lifecycle',
    'task start/end membership and order',
    'accepted event types, ids, sources, quality/missingness flags',
    'session-relative and acquisition/processing timestamps on the timeline'
  ]),
  does_not_guarantee: Object.freeze([
    'FeatureAccumulator samples or blink/closure summaries',
    'reconstruction of facial features or EAR values',
    'scientific measurement equivalence with the original session',
    'mission-adapter measurement side effects for observations'
  ])
});

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
    'silent coercion into V1',
    'malformed orchestration or mission sidecars',
    'unsupported orchestration, mission, or event contracts',
    'unknown sidecar contract_version'
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
  replay: ORCHESTRATION_REPLAY_CONTRACT,
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
    replay: input?.replay || null,
    orchestration
  });
}

export function attachLocalOrchestration(session, orchestrator) {
  if (!session || typeof session !== 'object') return session;
  orchestrator.mission.attachLocalMetadata(session);
  session.orchestration = orchestrator.snapshot();
  return session;
}

function failRead(kind, reason) {
  return {
    kind,
    compatible: false,
    coerced: false,
    orchestration: null,
    reason
  };
}

export function readOrchestrationSidecar(orchestration) {
  if (orchestration == null) return { ok: true, orchestration: null };
  if (typeof orchestration !== 'object' || Array.isArray(orchestration)) {
    return { ok: false, kind: 'malformed-orchestration', reason: 'orchestration sidecar is not an object' };
  }
  if (orchestration.contract_id !== ORCHESTRATION_CONTRACT_ID) {
    return { ok: false, kind: 'unsupported-orchestration', reason: 'unknown orchestration contract' };
  }
  if (orchestration.contract_version != null && orchestration.contract_version !== '0.1.0') {
    return {
      ok: false,
      kind: 'invalid-orchestration-version',
      reason: `unsupported orchestration contract_version ${orchestration.contract_version}`
    };
  }
  if (orchestration.events != null && !Array.isArray(orchestration.events)) {
    return { ok: false, kind: 'malformed-orchestration', reason: 'events must be an array' };
  }
  for (const event of orchestration.events || []) {
    if (!event || typeof event !== 'object' || event.contract_id !== RESEARCH_EVENT_CONTRACT_ID) {
      return {
        ok: false,
        kind: 'unsupported-event-contract',
        reason: 'event contract_id is not research-event/0.1-provisional'
      };
    }
  }
  return { ok: true, orchestration };
}

export function readMissionSidecar(mission) {
  if (mission == null) return { ok: true, mission: null };
  if (typeof mission !== 'object' || Array.isArray(mission)) {
    return { ok: false, kind: 'malformed-mission', reason: 'mission sidecar is not an object' };
  }
  if (mission.contract_id != null && mission.contract_id !== MISSION_EVENT_CONTRACT.contract_id) {
    return { ok: false, kind: 'unsupported-mission', reason: 'unknown mission contract' };
  }
  return { ok: true, mission };
}

export function readSessionArtifact(session) {
  const base = readCompatibleSession(session);
  if (!base.compatible) {
    return { ...base, orchestration: null };
  }
  const orchestrationRead = readOrchestrationSidecar(session.orchestration || null);
  if (!orchestrationRead.ok) return failRead(orchestrationRead.kind, orchestrationRead.reason);
  const missionRead = readMissionSidecar(session.mission || null);
  if (!missionRead.ok) return failRead(missionRead.kind, missionRead.reason);
  if (!orchestrationRead.orchestration) {
    return { ...base, orchestration: null };
  }
  return {
    ...base,
    orchestration: orchestrationRead.orchestration,
    local_only: true,
    upload_eligible: false
  };
}

const TIMELINE_FIELDS = Object.freeze([
  'contract_id',
  'contract_version',
  'session_id',
  'task_id',
  'type',
  'session_elapsed_ms',
  'task_elapsed_ms',
  'acquired_elapsed_ms',
  'processed_elapsed_ms',
  'source',
  'quality',
  'missingness'
]);

export function acceptedTimeline(events) {
  return (events || []).map((event) => Object.fromEntries(
    TIMELINE_FIELDS.map((key) => [key, event?.[key] ?? null])
  ));
}

function failReplay(orch, reason, event = null) {
  orch.replay = {
    ...ORCHESTRATION_REPLAY_CONTRACT,
    ok: false,
    reason,
    failed_event: event?.type || null
  };
  return orch;
}

export function replayOrchestration(artifact, { protocol = null } = {}) {
  const snap = artifact.orchestration || artifact;
  let resolved = protocol;
  if (!resolved) {
    try {
      resolved = defineProtocol(snap.protocol);
    } catch {
      const failed = createSessionOrchestrator({
        protocol: V1_GO_NO_GO_PROTOCOL,
        session_id: snap.session_id || 'invalid-replay',
        mode: snap.mode || 'simulated'
      });
      return failReplay(failed, 'invalid_protocol');
    }
  }
  let now = 0;
  const orch = createSessionOrchestrator({
    now: () => now,
    protocol: resolved,
    session_id: snap.session_id,
    mode: snap.mode
  });
  const events = snap.events;
  if (events != null && !Array.isArray(events)) {
    return failReplay(orch, 'malformed_timeline');
  }
  for (const event of events || []) {
    if (event.type === 'resources_cleared') {
      if (orch.state !== 'completed' && orch.state !== 'interrupted' && orch.state !== 'failed') {
        return failReplay(orch, 'unexpected_resources_cleared', event);
      }
      continue;
    }
    const elapsed = Number.isFinite(event.session_elapsed_ms) ? event.session_elapsed_ms : 0;
    const processed = Number.isFinite(event.processed_elapsed_ms) ? event.processed_elapsed_ms : elapsed;
    now = processed;
    let result;
    if (event.type === 'session_ready') {
      result = orch.prepare(now);
    } else if (event.type === 'session_started') {
      now = 0;
      result = orch.startSession({ startedAt: 0 });
    } else if (event.type === 'task_started') {
      result = orch.startTask(event.task_id, { startedAt: elapsed });
    } else if (event.type === 'task_ended') {
      result = orch.endTask(event.task_id, { reason: event.reason || 'completed', endedAt: elapsed });
    } else if (event.type === 'observation' || event.type === 'dropout') {
      result = orch.importTimelineEvent(event);
    } else if (event.type === 'session_completed') {
      result = orch.completeSession({ endedAt: elapsed });
    } else if (event.type === 'session_interrupted') {
      result = orch.interrupt({ reason: event.reason || 'interrupted', endedAt: elapsed });
    } else if (event.type === 'session_failed') {
      result = orch.fail({ reason: event.reason || 'failed', endedAt: elapsed });
    } else {
      return failReplay(orch, 'unsupported_replay_event', event);
    }
    if (!result || result.ok !== true) {
      return failReplay(orch, result?.reason || 'replay_failed', event);
    }
  }
  orch.replay = { ...ORCHESTRATION_REPLAY_CONTRACT, ok: true };
  return orch;
}
