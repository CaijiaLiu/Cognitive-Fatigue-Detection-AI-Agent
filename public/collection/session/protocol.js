export const PROTOCOL_CONTRACT_ID = 'research-protocol/0.1-provisional';
export const ORCHESTRATION_CONTRACT_ID = 'research-session/0.1-provisional';
export const RESEARCH_EVENT_CONTRACT_ID = 'research-event/0.1-provisional';
export const RESEARCH_EVENT_CONTRACT_VERSION = '0.1.0';

const VISION_SOURCES = new Set(['camera', 'simulated', 'unavailable', 'optional']);
const BEHAVIOR_SOURCES = new Set(['human', 'optional']);

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`protocol ${field} is required`);
  return value.trim();
}

export function defineTaskDescriptor(input = {}) {
  const protocol_id = requireString(input.protocol_id, 'task.protocol_id');
  const scientific_review = protocol_id === 'go-no-go-v1' ? 'v1-existing' : (input.scientific_review || 'PENDING_SCIENTIFIC_REVIEW');
  return {
    task_id: requireString(input.task_id, 'task.task_id'),
    kind: requireString(input.kind, 'task.kind'),
    protocol_id,
    protocol_version: input.protocol_version || (protocol_id === 'go-no-go-v1' ? '1.0.0' : '0.1.0'),
    config_ref: input.config_ref || null,
    lifecycle: {
      start: 'once',
      end: 'once',
      overlap: false,
      pause: false
    },
    data_sources: {
      vision: VISION_SOURCES.has(input.data_sources?.vision) ? input.data_sources.vision : 'optional',
      behavior: BEHAVIOR_SOURCES.has(input.data_sources?.behavior) ? input.data_sources.behavior : 'human'
    },
    missingness: {
      quality_flags: ['no_face', 'eyes_unavailable', 'tracking_gap', 'closed_eyes', 'valid'],
      dropout_is_open_eyes: false
    },
    scientific_review,
    notes: input.notes || 'Engineering slot only. Not a signed biomedical protocol.'
  };
}

export function defineProtocol(input = {}) {
  const protocol_id = requireString(input.protocol_id, 'protocol_id');
  const tasks = (input.tasks || []).map(defineTaskDescriptor);
  const ids = new Set();
  for (const task of tasks) {
    if (ids.has(task.task_id)) throw new Error(`duplicate task_id ${task.task_id}`);
    ids.add(task.task_id);
  }
  const scientific_review = protocol_id === 'go-no-go-v1' ? 'v1-existing' : (input.scientific_review || 'PENDING_SCIENTIFIC_REVIEW');
  return Object.freeze({
    contract_id: PROTOCOL_CONTRACT_ID,
    contract_version: '0.1.0',
    schema_version: '1.0.0',
    protocol_id,
    protocol_version: input.protocol_version || (protocol_id === 'go-no-go-v1' ? '1.0.0' : '0.1.0'),
    scientific_review,
    local_only: scientific_review !== 'v1-existing',
    upload_eligible: false,
    ordered: true,
    pause_supported: false,
    tasks,
    data_sources: {
      vision: input.data_sources?.vision || 'optional',
      behavior: input.data_sources?.behavior || 'required',
      ratings: input.data_sources?.ratings || 'optional'
    },
    missingness: {
      preserve: true,
      dropout_is_open_eyes: false
    },
    does_not_redefine: [
      'pvt stimulus or outcome definitions',
      'go-no-go-v1 trial semantics',
      'fatigue rating scale or three-rating protocol',
      'V1 schema 1.0.0'
    ]
  });
}

export const V1_GO_NO_GO_PROTOCOL = defineProtocol({
  protocol_id: 'go-no-go-v1',
  protocol_version: '1.0.0',
  scientific_review: 'v1-existing',
  data_sources: { vision: 'optional', behavior: 'required', ratings: 'optional' },
  tasks: [{
    task_id: 'go-no-go',
    kind: 'go-no-go',
    protocol_id: 'go-no-go-v1',
    protocol_version: '1.0.0',
    config_ref: 'public/collection/tasks/go-no-go.js',
    data_sources: { vision: 'optional', behavior: 'human' },
    scientific_review: 'v1-existing',
    notes: 'Existing V1 adapter. Orchestration does not change trial semantics.'
  }]
});

export const PROVISIONAL_SEQUENCE_PROTOCOL = defineProtocol({
  protocol_id: 'research-session-sequence/0.1-provisional',
  protocol_version: '0.1.0',
  scientific_review: 'PENDING_SCIENTIFIC_REVIEW',
  data_sources: { vision: 'optional', behavior: 'required', ratings: 'optional' },
  tasks: [
    {
      task_id: 'slot-a',
      kind: 'generic-slot',
      protocol_id: 'PENDING_SCIENTIFIC_REVIEW',
      config_ref: null,
      data_sources: { vision: 'optional', behavior: 'human' },
      notes: 'Placeholder first slot. Not PVT and not a signed task.'
    },
    {
      task_id: 'slot-b',
      kind: 'generic-slot',
      protocol_id: 'PENDING_SCIENTIFIC_REVIEW',
      config_ref: null,
      data_sources: { vision: 'optional', behavior: 'human' },
      notes: 'Placeholder second slot. Not Go/No-Go science and not a signed task.'
    }
  ]
});

export function visionSourceFromMode(mode) {
  if (mode === 'camera') return 'camera';
  if (mode === 'simulated') return 'simulated';
  return 'task-only';
}

export function validateResearchEvent(event, { taskIds = null } = {}) {
  if (!event || event.contract_id !== RESEARCH_EVENT_CONTRACT_ID) {
    return { ok: false, reason: 'invalid_event_contract' };
  }
  if (event.contract_version !== RESEARCH_EVENT_CONTRACT_VERSION) {
    return { ok: false, reason: 'invalid_event_version' };
  }
  if (typeof event.type !== 'string' || !event.type.trim()) {
    return { ok: false, reason: 'invalid_event_type' };
  }
  if (event.task_id != null && taskIds && !taskIds.has(event.task_id)) {
    return { ok: false, reason: 'task_membership' };
  }
  for (const key of ['session_elapsed_ms', 'task_elapsed_ms', 'acquired_elapsed_ms', 'processed_elapsed_ms']) {
    if (event[key] != null && !Number.isFinite(event[key])) {
      return { ok: false, reason: 'invalid_timestamp' };
    }
  }
  if (
    Number.isFinite(event.acquired_elapsed_ms)
    && Number.isFinite(event.processed_elapsed_ms)
    && event.acquired_elapsed_ms > event.processed_elapsed_ms
  ) {
    return { ok: false, reason: 'future_acquisition' };
  }
  return { ok: true };
}
