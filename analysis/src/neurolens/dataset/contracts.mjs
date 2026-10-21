/**
 * W4.1 dataset pipeline contracts.
 * Engineering records only. Not a scientific or clinical interface.
 */
import { createHash } from 'node:crypto';
import { REASON_CODES as AGENT_REASON_CODES } from '../agent/constants.mjs';

export const CONTRACT_VERSION = '0.1.0';
export const DATASET_MANIFEST_CONTRACT = 'dataset-manifest/0.1-provisional';
export const DATASET_SESSION_CONTRACT = 'dataset-session/0.1-provisional';
export const DATASET_WINDOW_CONTRACT = 'dataset-window/0.1-provisional';
export const DATASET_OBSERVATION_CONTRACT = 'dataset-observation/0.1-provisional';
export const DATASET_VALIDATE_CONTRACT = 'dataset-validate/0.1-provisional';
export const DATASET_WINDOW_ALGORITHM = 'dataset-window/0.1-provisional';
export const FEATURE_DEFINITION_VERSION = 'feature-dictionary/0.1';
export const COLLECTION_SCHEMA_V1 = '1.0.0';
export const PROTOCOL_GO_NO_GO_V1 = 'go-no-go-v1';
export const PROTOCOL_VERSION_GO_NO_GO = '1.0.0';
export const MISSION_EVENT_CONTRACT_ID = 'mission-event/0.1-provisional';
export const DEFAULT_DATASET_ID = 'neurolens-w4-1';
export const PRODUCER_ID = 'neurolens.dataset.builder';
export const PRODUCER_VERSION = '0.1.0';

export const ALLOWED_PROTOCOLS = Object.freeze([PROTOCOL_GO_NO_GO_V1]);
export const ALLOWED_MODES = Object.freeze(['camera', 'simulated', 'behavior']);
export const ALLOWED_STATUSES = Object.freeze(['completed', 'interrupted']);
export const MIXING_POLICY = 'stratify_by_vision_source';
export const PARTICIPANT_SPLIT_KEY = 'participant_id';

export const SCIENTIFIC_REVIEW = Object.freeze({
  V1_EXISTING: 'v1-existing',
  PENDING: 'PENDING_SCIENTIFIC_REVIEW',
});

export const SCIENTIFIC_ELIGIBILITY = Object.freeze({
  PENDING_REVIEW: 'pending_review',
});

export const WINDOW_ORIGIN = Object.freeze({
  MISSION_SIDECAR: 'mission_sidecar',
  SESSION_FALLBACK: 'session_fallback',
});

export const WINDOW_KIND = Object.freeze({
  GO_NO_GO: 'go-no-go',
  UNSIGNED_SLOT: 'unsigned-slot',
});

export const WINDOW_STATUS = Object.freeze({
  COMPLETED: 'completed',
  INTERRUPTED: 'interrupted',
  EMPTY: 'empty',
});

export const QUALITY_FLAGS = Object.freeze([
  'valid',
  'no_face',
  'eyes_unavailable',
  'tracking_gap',
  'closed_eyes',
]);

export const UNASSIGNED_REASON = Object.freeze({
  PRE_TASK: 'pre_task',
  POST_TASK: 'post_task',
  NO_WINDOW: 'no_window',
});

export const SIDECAR_STATUS = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
});

export const OBSERVATION_UNITS = Object.freeze({
  eye_aspect_ratio: 'ratio',
  gaze: 'eye_width_normalized',
});

export const BLOCKED_SIDECAR_KEYS = Object.freeze([
  'orchestration',
  'research_session',
  'research_events',
  'research_protocol',
  'replay',
  'session_replay',
  'analysis_evidence',
  'w4_session_artifact',
]);

export const PRIVACY_DROPPED_KEYS = Object.freeze([
  'environment',
  'notes',
  'events',
  'video',
  'withdrawal_token',
  'upload_token',
  'user_agent',
]);

export const REASON_CODES = AGENT_REASON_CODES;

export const DATASET_LIMITATIONS = Object.freeze([
  'Engineering dataset only; scientific_eligibility remains pending_review.',
  'Not a fatigue diagnosis, ADHD probability, or clinically validated record.',
  'participant_ref is a browser-pseudonymous alias, not a verified unique person.',
  'Camera source presence is not proof of valid ocular measurements.',
  'Simulated vision must not be pooled with camera ocular rows.',
  'session_fallback windows are whole-session envelopes, not measured task boundaries.',
  'No new ocular metrics, PERCLOS thresholds, or ML features are derived.',
  'Unmerged Week 3 orchestration/evidence contracts are not consumed.',
]);

export function scientificReviewForProtocol(protocolId) {
  return protocolId === PROTOCOL_GO_NO_GO_V1
    ? SCIENTIFIC_REVIEW.V1_EXISTING
    : SCIENTIFIC_REVIEW.PENDING;
}

export function visionProvenance(mode) {
  if (mode === 'camera') return 'camera';
  if (mode === 'simulated') return 'simulated';
  return 'task-only';
}

export function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('Non-finite numbers cannot be canonicalized.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function sha256Canonical(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function toCanonicalJson(value) {
  return `${JSON.stringify(JSON.parse(stableStringify(value)), null, 2)}\n`;
}
