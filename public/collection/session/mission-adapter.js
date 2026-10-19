export const MISSION_EVENT_CONTRACT = {
  contract_id: 'mission-event/0.1-provisional',
  scientific_review: 'PENDING_SCIENTIFIC_REVIEW',
  schema_identity: 'local-only; does not replace schema_version 1.0.0',
  does_not_redefine: [
    'pvt stimulus or outcome definitions',
    'go-no-go-v1 trial semantics',
    'fatigue rating scale or three-rating protocol',
    'V1 schema 1.0.0'
  ]
};

export function createMissionAdapter({ now = () => performance.now() } = {}) {
  let sessionStart = null;
  let mode = null;
  let current = null;
  const tasks = [];
  const events = [];
  let resources = { timers: 0, listeners: 0, tracking: false };

  function sessionElapsed(ts = now()) {
    return sessionStart == null ? null : ts - sessionStart;
  }

  function push(type, extra = {}, ts = now()) {
    events.push({
      contract_id: MISSION_EVENT_CONTRACT.contract_id,
      scientific_review: MISSION_EVENT_CONTRACT.scientific_review,
      type,
      session_elapsed_ms: extra.session_elapsed_ms ?? sessionElapsed(ts),
      task_elapsed_ms: extra.task_elapsed_ms ?? (current ? ts - current.started : null),
      ...extra
    });
  }

  function endOpenTask(reason, endedAt) {
    if (!current || current.ended != null) return;
    current.ended = endedAt;
    current.reason = reason;
    push('mission_task_ended', { kind: current.kind, protocol_id: current.protocol_id, reason }, endedAt);
    current = null;
  }

  return {
    beginSession({ mode: nextMode, startedAt = now() }) {
      sessionStart = startedAt;
      mode = nextMode;
      current = null;
      tasks.length = 0;
      events.length = 0;
      resources = { timers: 0, listeners: 0, tracking: false };
      push('mission_session_started', { mode }, startedAt);
    },
    beginTask({ kind, protocol_id = 'PENDING_SCIENTIFIC_REVIEW', startedAt = now() }) {
      if (current) endOpenTask('superseded_to_protect_boundaries', startedAt);
      const scientific_review = protocol_id === 'go-no-go-v1' ? 'v1-existing' : 'PENDING_SCIENTIFIC_REVIEW';
      current = { kind, protocol_id, scientific_review, started: startedAt, ended: null, reason: null };
      tasks.push(current);
      push('mission_task_started', { kind, protocol_id, scientific_review }, startedAt);
    },
    endTask({ reason = 'completed', endedAt = now() } = {}) {
      endOpenTask(reason, endedAt);
    },
    endSession({ endedAt = now() } = {}) {
      endOpenTask('session_ended', endedAt);
      push('mission_session_ended', {}, endedAt);
    },
    currentWindow() {
      if (current) return { started: current.started, ended: current.ended, kind: current.kind };
      const last = tasks[tasks.length - 1];
      return last ? { started: last.started, ended: last.ended, kind: last.kind } : null;
    },
    rejectFrame(classification) {
      push('mission_frame_rejected', {
        reason: classification.reason,
        session_elapsed_ms: classification.session_elapsed_ms ?? null,
        processed_elapsed_ms: classification.processed_elapsed_ms ?? null,
        task_elapsed_ms: classification.task_elapsed_ms ?? null
      });
    },
    recordDropout({ session_elapsed_ms, gap_ms }) {
      push('mission_dropout', {
        session_elapsed_ms,
        gap_ms,
        quality: 'tracking_gap',
        interpreted_as_open_eyes: false
      });
    },
    markResources(next) {
      resources = { ...resources, ...next };
    },
    cleanup() {
      resources = { timers: 0, listeners: 0, tracking: false };
      push('mission_resources_cleared', { resources: { ...resources } });
      return { ...resources };
    },
    attachLocalMetadata(session) {
      if (!session || typeof session !== 'object') return session;
      session.mission = {
        contract_id: MISSION_EVENT_CONTRACT.contract_id,
        scientific_review: MISSION_EVENT_CONTRACT.scientific_review,
        local_only: true,
        upload_eligible: false,
        events: events.slice(),
        tasks: tasks.map((task) => ({
          kind: task.kind,
          protocol_id: task.protocol_id,
          scientific_review: task.scientific_review,
          started_session_ms: sessionStart == null ? null : task.started - sessionStart,
          ended_session_ms: task.ended == null || sessionStart == null ? null : task.ended - sessionStart,
          reason: task.reason
        }))
      };
      return session;
    },
    events: () => events.slice(),
    taskRecords: () => tasks.map((task) => ({ ...task })),
    get sessionStart() { return sessionStart; },
    get mode() { return mode; },
    get resources() { return { ...resources }; }
  };
}

export function readCompatibleSession(session) {
  if (!session || typeof session !== 'object') {
    return { kind: 'invalid', compatible: false, coerced: false };
  }
  if (
    session.schema_version === 'mission-preview-1'
    || session.protocol === 'mission-exploratory-v1'
    || session.protocol_version === 'mission-exploratory-v1'
    || session.config?.protocol === 'mission-exploratory-v1'
  ) {
    return {
      kind: 'mission-preview',
      compatible: false,
      coerced: false,
      reason: 'preview records stay local and are not rewritten as V1'
    };
  }
  if (session.schema_version === '1.0.0') {
    return {
      kind: 'v1',
      compatible: true,
      coerced: false,
      schema_version: '1.0.0',
      mission: session.mission || null
    };
  }
  return { kind: 'unsupported', compatible: false, coerced: false };
}

export function missionProvenance(mode) {
  return {
    vision: mode === 'camera' ? 'camera' : mode === 'simulated' ? 'simulated' : 'unavailable',
    behavior: 'human',
    ratings: 'self_report'
  };
}
