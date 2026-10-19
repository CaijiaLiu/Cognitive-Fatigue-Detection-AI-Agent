import { FeatureAccumulator } from '../features/accumulator.js';
import { createMissionAdapter } from './mission-adapter.js';
import {
  ORCHESTRATION_CONTRACT_ID,
  RESEARCH_EVENT_CONTRACT_ID,
  V1_GO_NO_GO_PROTOCOL,
  validateResearchEvent,
  visionSourceFromMode
} from './protocol.js';

const TERMINAL = new Set(['completed', 'interrupted', 'failed']);
const ALLOWED = {
  created: new Set(['ready', 'interrupted', 'failed']),
  ready: new Set(['running', 'interrupted', 'failed']),
  running: new Set(['completed', 'interrupted', 'failed']),
  completed: new Set(),
  interrupted: new Set(),
  failed: new Set()
};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function createSessionOrchestrator({
  now = () => performance.now(),
  protocol = V1_GO_NO_GO_PROTOCOL,
  session_id = 'session-orchestration',
  mode = 'simulated',
  mission = null,
  accumulator = null
} = {}) {
  const clock = now;
  const adapter = mission || createMissionAdapter({ now: clock });
  const acc = accumulator || new FeatureAccumulator(0.3);
  const taskIndex = new Map(protocol.tasks.map((task, index) => [task.task_id, { ...task, index }]));
  let state = 'created';
  let sessionStart = null;
  let currentTaskId = null;
  let nextTaskIndex = 0;
  const tasks = protocol.tasks.map((task) => ({
    task_id: task.task_id,
    kind: task.kind,
    protocol_id: task.protocol_id,
    scientific_review: task.scientific_review,
    started_at: null,
    ended_at: null,
    reason: null
  }));
  const events = [];
  const rejected = [];
  let lastSessionElapsed = null;
  let lastAcquisition = null;
  let resources = { timers: 0, listeners: 0, tracking: false };

  function sessionElapsed(ts = clock()) {
    return sessionStart == null ? null : ts - sessionStart;
  }

  function currentTask() {
    return currentTaskId ? tasks.find((task) => task.task_id === currentTaskId) : null;
  }

  function transition(next, ts, extra = {}) {
    if (state === next && TERMINAL.has(next)) {
      return { ok: true, idempotent: true, state };
    }
    if (!ALLOWED[state].has(next)) {
      return rejectEvent('invalid_transition', { from: state, to: next }, ts);
    }
    state = next;
    return appendEvent(`${next === 'ready' ? 'session_ready' : next === 'running' ? 'session_started' : `session_${next}`}`, extra, ts);
  }

  function rejectEvent(reason, extra = {}, ts = clock()) {
    const record = {
      ok: false,
      reason,
      state,
      ...extra,
      session_elapsed_ms: sessionElapsed(ts)
    };
    rejected.push(record);
    return record;
  }

  function appendEvent(type, extra = {}, ts = clock()) {
    const elapsed = extra.session_elapsed_ms ?? sessionElapsed(ts);
    if (elapsed != null && lastSessionElapsed != null && elapsed < lastSessionElapsed) {
      return rejectEvent('out_of_order', { type, session_elapsed_ms: elapsed }, ts);
    }
    const task = currentTask();
    const event = {
      contract_id: RESEARCH_EVENT_CONTRACT_ID,
      contract_version: '0.1.0',
      scientific_review: protocol.scientific_review,
      protocol_id: protocol.protocol_id,
      protocol_version: protocol.protocol_version,
      session_id,
      task_id: extra.task_id ?? currentTaskId,
      type,
      session_elapsed_ms: elapsed,
      task_elapsed_ms: extra.task_elapsed_ms ?? (task?.started_at == null || ts == null ? null : ts - task.started_at),
      acquired_elapsed_ms: extra.acquired_elapsed_ms ?? null,
      processed_elapsed_ms: extra.processed_elapsed_ms ?? null,
      source: extra.source ?? visionSourceFromMode(mode),
      quality: extra.quality ?? null,
      missingness: extra.missingness ?? null,
      local_only: true,
      upload_eligible: false,
      ...('reason' in extra ? { reason: extra.reason } : {})
    };
    const valid = validateResearchEvent(event, { taskIds: taskIndex });
    if (!valid.ok) return rejectEvent(valid.reason, { type }, ts);
    events.push(event);
    if (elapsed != null) lastSessionElapsed = elapsed;
    return { ok: true, event, state };
  }

  function prepare(ts = clock()) {
    return transition('ready', ts);
  }

  function startSession({ startedAt = clock() } = {}) {
    if (state === 'running') return { ok: true, idempotent: true, state };
    const moved = transition('running', startedAt, { source: visionSourceFromMode(mode) });
    if (!moved.ok) return moved;
    sessionStart = startedAt;
    adapter.beginSession({ mode, startedAt });
    resources = { timers: 1, listeners: 1, tracking: mode === 'camera' };
    adapter.markResources(resources);
    moved.event.session_elapsed_ms = 0;
    lastSessionElapsed = 0;
    return moved;
  }

  function startTask(task_id, { startedAt = clock() } = {}) {
    if (TERMINAL.has(state)) return rejectEvent('session_closed', { type: 'task_started', task_id }, startedAt);
    if (state !== 'running') return rejectEvent('invalid_transition', { type: 'task_started', task_id, from: state }, startedAt);
    const descriptor = taskIndex.get(task_id);
    if (!descriptor) return rejectEvent('unknown_task', { task_id }, startedAt);
    const task = tasks[descriptor.index];
    if (task.started_at != null) return rejectEvent('duplicate_task_start', { task_id }, startedAt);
    if (currentTaskId) return rejectEvent('task_overlap', { task_id, active: currentTaskId }, startedAt);
    if (descriptor.index !== nextTaskIndex) return rejectEvent('task_out_of_order', { task_id, expected: protocol.tasks[nextTaskIndex]?.task_id }, startedAt);
    currentTaskId = task_id;
    task.started_at = startedAt;
    adapter.beginTask({ kind: task.kind, protocol_id: task.protocol_id, startedAt });
    return appendEvent('task_started', { task_id, source: visionSourceFromMode(mode) }, startedAt);
  }

  function endTask(task_id, { reason = 'completed', endedAt = clock() } = {}) {
    if (TERMINAL.has(state) && currentTaskId == null) return rejectEvent('session_closed', { type: 'task_ended', task_id }, endedAt);
    const descriptor = taskIndex.get(task_id);
    if (!descriptor) return rejectEvent('unknown_task', { task_id }, endedAt);
    const task = tasks[descriptor.index];
    if (task.started_at == null) return rejectEvent('task_not_started', { task_id }, endedAt);
    if (task.ended_at != null) return { ok: true, idempotent: true, state, task_id };
    if (currentTaskId !== task_id) return rejectEvent('task_membership', { task_id, active: currentTaskId }, endedAt);
    task.ended_at = endedAt;
    task.reason = reason;
    const result = appendEvent('task_ended', { task_id, reason }, endedAt);
    adapter.endTask({ reason, endedAt });
    currentTaskId = null;
    nextTaskIndex = descriptor.index + 1;
    return result;
  }

  function completeSession({ endedAt = clock() } = {}) {
    if (state === 'completed') return { ok: true, idempotent: true, state };
    if (currentTaskId) return rejectEvent('active_task', { task_id: currentTaskId }, endedAt);
    if (nextTaskIndex < tasks.length) return rejectEvent('incomplete_sequence', { remaining: tasks.length - nextTaskIndex }, endedAt);
    const moved = transition('completed', endedAt);
    if (moved.ok) {
      adapter.endSession({ endedAt });
      cleanup(endedAt);
    }
    return moved;
  }

  function interrupt({ reason = 'interrupted', endedAt = clock() } = {}) {
    if (state === 'interrupted') return { ok: true, idempotent: true, state };
    if (currentTaskId) endTask(currentTaskId, { reason, endedAt });
    const moved = transition('interrupted', endedAt, { reason });
    if (moved.ok) {
      adapter.endSession({ endedAt });
      cleanup(endedAt);
    }
    return moved;
  }

  function fail({ reason = 'failed', endedAt = clock() } = {}) {
    if (state === 'failed') return { ok: true, idempotent: true, state };
    if (currentTaskId) endTask(currentTaskId, { reason, endedAt });
    const moved = transition('failed', endedAt, { reason });
    if (moved.ok) {
      adapter.endSession({ endedAt });
      cleanup(endedAt);
    }
    return moved;
  }

  function recordObservation({
    acquisitionTs,
    processedTs = clock(),
    source = visionSourceFromMode(mode),
    quality = 'valid',
    features = { face_present: true, ear: 0.3, gaze_x: 0.5, gaze_y: 0, rotation: null }
  } = {}) {
    if (TERMINAL.has(state)) return rejectEvent('session_closed', { type: 'observation' }, processedTs);
    if (state !== 'running' || !currentTaskId) return rejectEvent('no_active_task', { type: 'observation' }, processedTs);
    if (!finite(acquisitionTs) || !finite(processedTs)) return rejectEvent('invalid_timestamp', { type: 'observation' }, processedTs);
    if (acquisitionTs > processedTs) return rejectEvent('future_acquisition', { type: 'observation' }, processedTs);
    const acquired_elapsed_ms = sessionElapsed(acquisitionTs);
    const processed_elapsed_ms = sessionElapsed(processedTs);
    if (acquired_elapsed_ms < 0) return rejectEvent('pre_session', { type: 'observation' }, processedTs);
    const window = adapter.currentWindow();
    if (window?.started != null && acquisitionTs < window.started) {
      adapter.rejectFrame({ reason: 'pre_task', session_elapsed_ms: acquired_elapsed_ms, processed_elapsed_ms });
      return rejectEvent('pre_task', { type: 'observation' }, processedTs);
    }
    if (window?.ended != null && acquisitionTs >= window.ended) {
      adapter.rejectFrame({ reason: 'post_task', session_elapsed_ms: acquired_elapsed_ms, processed_elapsed_ms });
      return rejectEvent('post_task', { type: 'observation' }, processedTs);
    }
    if (lastAcquisition != null && acquisitionTs <= lastAcquisition) {
      return rejectEvent('out_of_order', { type: 'observation' }, processedTs);
    }
    lastAcquisition = acquisitionTs;
    acc.add(acquired_elapsed_ms, features, source === 'task-only' ? 'unavailable' : source, {
      acquired_elapsed_ms,
      processed_elapsed_ms
    });
    return appendEvent('observation', {
      source,
      quality,
      acquired_elapsed_ms,
      processed_elapsed_ms,
      session_elapsed_ms: acquired_elapsed_ms
    }, processedTs);
  }

  function recordDropout({ at = clock(), gap_ms = 400, source = visionSourceFromMode(mode) } = {}) {
    if (TERMINAL.has(state)) return rejectEvent('session_closed', { type: 'dropout' }, at);
    const elapsed = sessionElapsed(at);
    acc.noteDropout(elapsed < 0 ? 0 : elapsed, source === 'task-only' ? 'unavailable' : source);
    adapter.recordDropout({ session_elapsed_ms: elapsed, gap_ms });
    return appendEvent('dropout', {
      source,
      quality: 'tracking_gap',
      missingness: 'dropout',
      session_elapsed_ms: elapsed
    }, at);
  }

  function cleanup(ts = clock()) {
    resources = { timers: 0, listeners: 0, tracking: false };
    adapter.cleanup();
    return appendEvent('resources_cleared', { source: visionSourceFromMode(mode) }, ts);
  }

  function reset() {
    if (!TERMINAL.has(state) && state !== 'created') interrupt({ reason: 'reset' });
    state = 'created';
    sessionStart = null;
    currentTaskId = null;
    nextTaskIndex = 0;
    lastSessionElapsed = null;
    lastAcquisition = null;
    events.length = 0;
    rejected.length = 0;
    resources = { timers: 0, listeners: 0, tracking: false };
    for (const task of tasks) {
      task.started_at = null;
      task.ended_at = null;
      task.reason = null;
    }
    acc.samples.length = 0;
    acc.blinks.length = 0;
    acc.previous = null;
    acc.closedStart = null;
    acc.validMs = 0;
    acc.closedMs = 0;
    acc.headTravel = 0;
    acc.headMs = 0;
    acc.gaze = [];
    return { ok: true, state };
  }

  return {
    prepare,
    startSession,
    startTask,
    endTask,
    completeSession,
    interrupt,
    fail,
    recordObservation,
    recordDropout,
    cleanup,
    reset,
    snapshot() {
      return {
        contract_id: ORCHESTRATION_CONTRACT_ID,
        scientific_review: protocol.scientific_review,
        local_only: true,
        upload_eligible: false,
        session_id,
        mode,
        state,
        protocol,
        tasks: tasks.map((task) => ({
          ...task,
          started_session_ms: task.started_at == null || sessionStart == null ? null : task.started_at - sessionStart,
          ended_session_ms: task.ended_at == null || sessionStart == null ? null : task.ended_at - sessionStart
        })),
        events: events.slice(),
        rejected: rejected.slice(),
        resources: { ...resources },
        vision_summary: acc.summary(sessionElapsed() || 0)
      };
    },
    get state() { return state; },
    get protocol() { return protocol; },
    get session_id() { return session_id; },
    get mode() { return mode; },
    get accumulator() { return acc; },
    get mission() { return adapter; },
    events: () => events.slice(),
    rejectedEvents: () => rejected.slice(),
    currentTaskId: () => currentTaskId
  };
}
