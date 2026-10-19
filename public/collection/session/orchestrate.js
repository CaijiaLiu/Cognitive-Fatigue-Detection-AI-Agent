import { FeatureAccumulator } from '../features/accumulator.js';
import { createMissionAdapter } from './mission-adapter.js';
import {
  ORCHESTRATION_CONTRACT_ID,
  RESEARCH_EVENT_CONTRACT_ID,
  RESEARCH_EVENT_CONTRACT_VERSION,
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

  function rejectEvent(reason, extra = {}, ts = clock()) {
    const record = {
      ok: false,
      reason,
      state,
      ...extra,
      session_elapsed_ms: extra.session_elapsed_ms ?? sessionElapsed(ts)
    };
    rejected.push(record);
    return record;
  }

  function previewEvent(type, extra = {}, ts = clock(), lastElapsed = lastSessionElapsed) {
    const elapsed = extra.session_elapsed_ms ?? sessionElapsed(ts);
    if (elapsed != null && lastElapsed != null && elapsed < lastElapsed) {
      return { ok: false, reason: 'out_of_order', type, session_elapsed_ms: elapsed };
    }
    const task = currentTask();
    const event = {
      contract_id: RESEARCH_EVENT_CONTRACT_ID,
      contract_version: RESEARCH_EVENT_CONTRACT_VERSION,
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
    if (!valid.ok) return { ok: false, reason: valid.reason, type, session_elapsed_ms: elapsed };
    return { ok: true, event, elapsed };
  }

  function commitEvent(preview) {
    events.push(preview.event);
    if (preview.elapsed != null) lastSessionElapsed = preview.elapsed;
    return { ok: true, event: preview.event, state };
  }

  function rejectPreview(preview, ts = clock()) {
    return rejectEvent(preview.reason, { type: preview.type, session_elapsed_ms: preview.session_elapsed_ms }, ts);
  }

  function transition(next, ts, extra = {}) {
    if (state === next && TERMINAL.has(next)) {
      return { ok: true, idempotent: true, state };
    }
    if (!ALLOWED[state].has(next)) {
      return rejectEvent('invalid_transition', { from: state, to: next }, ts);
    }
    const type = next === 'ready' ? 'session_ready' : next === 'running' ? 'session_started' : `session_${next}`;
    const preview = previewEvent(type, extra, ts);
    if (!preview.ok) return rejectPreview(preview, ts);
    state = next;
    return commitEvent(preview);
  }

  function prepare(ts = clock()) {
    return transition('ready', ts);
  }

  function startSession({ startedAt = clock() } = {}) {
    if (state === 'running') return { ok: true, idempotent: true, state };
    if (!ALLOWED[state].has('running')) {
      return rejectEvent('invalid_transition', { from: state, to: 'running', type: 'session_started' }, startedAt);
    }
    const preview = previewEvent('session_started', {
      source: visionSourceFromMode(mode),
      session_elapsed_ms: 0
    }, startedAt);
    if (!preview.ok) return rejectPreview(preview, startedAt);
    state = 'running';
    sessionStart = startedAt;
    adapter.beginSession({ mode, startedAt });
    resources = { timers: 1, listeners: 1, tracking: mode === 'camera' };
    adapter.markResources(resources);
    return commitEvent(preview);
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
    const preview = previewEvent('task_started', { task_id, source: visionSourceFromMode(mode) }, startedAt);
    if (!preview.ok) return rejectPreview(preview, startedAt);
    currentTaskId = task_id;
    task.started_at = startedAt;
    adapter.beginTask({ kind: task.kind, protocol_id: task.protocol_id, startedAt });
    return commitEvent(preview);
  }

  function endTask(task_id, { reason = 'completed', endedAt = clock() } = {}) {
    if (TERMINAL.has(state) && currentTaskId == null) return rejectEvent('session_closed', { type: 'task_ended', task_id }, endedAt);
    const descriptor = taskIndex.get(task_id);
    if (!descriptor) return rejectEvent('unknown_task', { task_id }, endedAt);
    const task = tasks[descriptor.index];
    if (task.started_at == null) return rejectEvent('task_not_started', { task_id }, endedAt);
    if (task.ended_at != null) return { ok: true, idempotent: true, state, task_id };
    if (currentTaskId !== task_id) return rejectEvent('task_membership', { task_id, active: currentTaskId }, endedAt);
    const preview = previewEvent('task_ended', { task_id, reason }, endedAt);
    if (!preview.ok) return rejectPreview(preview, endedAt);
    task.ended_at = endedAt;
    task.reason = reason;
    adapter.endTask({ reason, endedAt });
    currentTaskId = null;
    nextTaskIndex = descriptor.index + 1;
    return commitEvent(preview);
  }

  function commitTerminal(next, extra, endedAt) {
    if (state === next && TERMINAL.has(next)) return { ok: true, idempotent: true, state };
    if (!ALLOWED[state].has(next)) {
      return rejectEvent('invalid_transition', { from: state, to: next, type: `session_${next}` }, endedAt);
    }
    const previews = [];
    let last = lastSessionElapsed;
    const openId = currentTaskId;
    if (openId && (next === 'interrupted' || next === 'failed')) {
      const endPreview = previewEvent('task_ended', { task_id: openId, reason: extra.reason }, endedAt, last);
      if (!endPreview.ok) return rejectPreview(endPreview, endedAt);
      previews.push(endPreview);
      last = endPreview.elapsed ?? last;
    } else if (next === 'completed') {
      if (currentTaskId) return rejectEvent('active_task', { task_id: currentTaskId }, endedAt);
      if (nextTaskIndex < tasks.length) return rejectEvent('incomplete_sequence', { remaining: tasks.length - nextTaskIndex }, endedAt);
    }
    const sessionPreview = previewEvent(`session_${next}`, extra, endedAt, last);
    if (!sessionPreview.ok) return rejectPreview(sessionPreview, endedAt);
    previews.push(sessionPreview);
    last = sessionPreview.elapsed ?? last;
    const clearPreview = previewEvent('resources_cleared', { source: visionSourceFromMode(mode) }, endedAt, last);
    if (!clearPreview.ok) return rejectPreview(clearPreview, endedAt);
    previews.push(clearPreview);

    if (openId && (next === 'interrupted' || next === 'failed')) {
      const task = tasks[taskIndex.get(openId).index];
      task.ended_at = endedAt;
      task.reason = extra.reason;
      adapter.endTask({ reason: extra.reason, endedAt });
      currentTaskId = null;
      nextTaskIndex = taskIndex.get(openId).index + 1;
    }
    state = next;
    adapter.endSession({ endedAt });
    resources = { timers: 0, listeners: 0, tracking: false };
    adapter.cleanup();
    for (const preview of previews) commitEvent(preview);
    return { ok: true, event: sessionPreview.event, state };
  }

  function completeSession({ endedAt = clock() } = {}) {
    return commitTerminal('completed', {}, endedAt);
  }

  function interrupt({ reason = 'interrupted', endedAt = clock() } = {}) {
    return commitTerminal('interrupted', { reason }, endedAt);
  }

  function fail({ reason = 'failed', endedAt = clock() } = {}) {
    return commitTerminal('failed', { reason }, endedAt);
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
      return rejectEvent('pre_task', { type: 'observation' }, processedTs);
    }
    if (window?.ended != null && acquisitionTs >= window.ended) {
      return rejectEvent('post_task', { type: 'observation' }, processedTs);
    }
    if (lastAcquisition != null && acquisitionTs <= lastAcquisition) {
      return rejectEvent('out_of_order', { type: 'observation' }, processedTs);
    }
    const preview = previewEvent('observation', {
      source,
      quality,
      acquired_elapsed_ms,
      processed_elapsed_ms,
      session_elapsed_ms: acquired_elapsed_ms
    }, processedTs);
    if (!preview.ok) return rejectPreview(preview, processedTs);
    lastAcquisition = acquisitionTs;
    acc.add(acquired_elapsed_ms, features, source === 'task-only' ? 'unavailable' : source, {
      acquired_elapsed_ms,
      processed_elapsed_ms
    });
    return commitEvent(preview);
  }

  function recordDropout({ at = clock(), gap_ms = 400, source = visionSourceFromMode(mode) } = {}) {
    if (TERMINAL.has(state)) return rejectEvent('session_closed', { type: 'dropout' }, at);
    if (sessionStart == null) return rejectEvent('session_not_started', { type: 'dropout' }, at);
    const elapsed = sessionElapsed(at);
    if (!finite(at) || elapsed == null || elapsed < 0) return rejectEvent('invalid_timestamp', { type: 'dropout' }, at);
    const preview = previewEvent('dropout', {
      source,
      quality: 'tracking_gap',
      missingness: 'dropout',
      session_elapsed_ms: elapsed
    }, at);
    if (!preview.ok) return rejectPreview(preview, at);
    acc.noteDropout(elapsed, source === 'task-only' ? 'unavailable' : source);
    adapter.recordDropout({ session_elapsed_ms: elapsed, gap_ms });
    return commitEvent(preview);
  }

  function copyTimelineEvent(event) {
    const copied = {
      contract_id: event.contract_id,
      contract_version: event.contract_version,
      scientific_review: event.scientific_review,
      protocol_id: event.protocol_id,
      protocol_version: event.protocol_version,
      session_id: event.session_id,
      task_id: event.task_id,
      type: event.type,
      session_elapsed_ms: event.session_elapsed_ms,
      task_elapsed_ms: event.task_elapsed_ms,
      acquired_elapsed_ms: event.acquired_elapsed_ms,
      processed_elapsed_ms: event.processed_elapsed_ms,
      source: event.source,
      quality: event.quality,
      missingness: event.missingness,
      local_only: event.local_only,
      upload_eligible: event.upload_eligible
    };
    if ('reason' in event) copied.reason = event.reason;
    return copied;
  }

  function importTimelineEvent(event) {
    if (!event || typeof event !== 'object') {
      return rejectEvent('invalid_event_contract', { type: 'import' });
    }
    if (event.session_id !== session_id) {
      return rejectEvent('session_mismatch', { type: event.type, session_id: event.session_id });
    }
    if (event.contract_id !== RESEARCH_EVENT_CONTRACT_ID) {
      return rejectEvent('invalid_event_contract', { type: event.type });
    }
    if (event.contract_version !== RESEARCH_EVENT_CONTRACT_VERSION) {
      return rejectEvent('invalid_event_version', { type: event.type });
    }
    if (event.task_id != null && !taskIndex.has(event.task_id)) {
      return rejectEvent('task_membership', { type: event.type, task_id: event.task_id });
    }
    if (event.type === 'observation') {
      if (TERMINAL.has(state)) return rejectEvent('session_closed', { type: event.type });
      if (state !== 'running' || !currentTaskId) return rejectEvent('no_active_task', { type: event.type });
      if (event.task_id !== currentTaskId) {
        return rejectEvent('task_membership', { type: event.type, task_id: event.task_id, active: currentTaskId });
      }
    }
    if (event.type === 'dropout') {
      if (TERMINAL.has(state)) return rejectEvent('session_closed', { type: event.type });
      if (sessionStart == null) return rejectEvent('session_not_started', { type: event.type });
      if (event.task_id !== currentTaskId) {
        return rejectEvent('task_membership', { type: event.type, task_id: event.task_id, active: currentTaskId });
      }
    }
    const copied = copyTimelineEvent(event);
    const valid = validateResearchEvent(copied, { taskIds: taskIndex });
    if (!valid.ok) return rejectEvent(valid.reason, { type: event.type });
    if (copied.session_elapsed_ms != null && lastSessionElapsed != null && copied.session_elapsed_ms < lastSessionElapsed) {
      return rejectEvent('out_of_order', { type: event.type, session_elapsed_ms: copied.session_elapsed_ms });
    }
    if (copied.type === 'observation' && finite(copied.acquired_elapsed_ms) && sessionStart != null) {
      const acquisitionTs = sessionStart + copied.acquired_elapsed_ms;
      if (lastAcquisition != null && acquisitionTs <= lastAcquisition) {
        return rejectEvent('out_of_order', { type: event.type, session_elapsed_ms: copied.session_elapsed_ms });
      }
    }
    events.push(copied);
    if (copied.session_elapsed_ms != null) lastSessionElapsed = copied.session_elapsed_ms;
    if (copied.type === 'observation' && finite(copied.acquired_elapsed_ms) && sessionStart != null) {
      lastAcquisition = sessionStart + copied.acquired_elapsed_ms;
    }
    return { ok: true, event: copied, state };
  }

  function cleanup(ts = clock()) {
    const preview = previewEvent('resources_cleared', { source: visionSourceFromMode(mode) }, ts);
    if (!preview.ok) return rejectPreview(preview, ts);
    resources = { timers: 0, listeners: 0, tracking: false };
    adapter.cleanup();
    return commitEvent(preview);
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
    importTimelineEvent,
    cleanup,
    reset,
    snapshot() {
      return {
        contract_id: ORCHESTRATION_CONTRACT_ID,
        contract_version: '0.1.0',
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
        last_acquisition_ts: lastAcquisition,
        next_task_index: nextTaskIndex,
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
    currentTaskId: () => currentTaskId,
    nextTaskIndex: () => nextTaskIndex,
    lastAcquisition: () => lastAcquisition
  };
}
