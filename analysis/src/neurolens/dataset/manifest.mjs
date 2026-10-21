/**
 * Deterministic dataset assembly: fingerprints, counts, strata, limitations.
 * No Date.now(), Math.random(), network, D1, Sites, or OpenAI.
 */
import { summarizeTrials } from '../../../../public/collection/tasks/summary.js';
import {
  COLLECTION_SCHEMA_V1,
  CONTRACT_VERSION,
  DATASET_LIMITATIONS,
  DATASET_MANIFEST_CONTRACT,
  DATASET_SESSION_CONTRACT,
  DATASET_VALIDATE_CONTRACT,
  DATASET_WINDOW_ALGORITHM,
  DEFAULT_DATASET_ID,
  FEATURE_DEFINITION_VERSION,
  MIXING_POLICY,
  PARTICIPANT_SPLIT_KEY,
  PRODUCER_ID,
  PRODUCER_VERSION,
  PROTOCOL_GO_NO_GO_V1,
  PROTOCOL_VERSION_GO_NO_GO,
  SCIENTIFIC_ELIGIBILITY,
  SCIENTIFIC_REVIEW,
  SIDECAR_STATUS,
  WINDOW_ORIGIN,
  ALLOWED_MODES,
  ALLOWED_PROTOCOLS,
  scientificReviewForProtocol,
  sha256Canonical,
  stableStringify,
  toCanonicalJson,
  visionProvenance,
} from './contracts.mjs';
import { stripPrivacyFields } from './redaction.mjs';
import { collectValidatedSessions } from './validate.mjs';
import { assignMembership } from './windows.mjs';

export { stableStringify, sha256Canonical, toCanonicalJson };

function bump(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function emptyStrata() {
  return {
    vision_source: {},
    mode: {},
    status: {},
    window_origin: {},
    scientific_review: {},
    quality: {},
  };
}

function projectSession(session, membership) {
  const protocol_id = session.config.protocol;
  const sidecar = session.mission ? SIDECAR_STATUS.PRESENT : SIDECAR_STATUS.ABSENT;
  const behavior = summarizeTrials(session.trials);
  return {
    contract_id: DATASET_SESSION_CONTRACT,
    session_id: session.session_id,
    participant_ref: session.participant_id,
    group_key: session.participant_id,
    protocol_id,
    protocol_version: PROTOCOL_VERSION_GO_NO_GO,
    scientific_review: scientificReviewForProtocol(protocol_id),
    scientific_eligibility: SCIENTIFIC_ELIGIBILITY.PENDING_REVIEW,
    engineering_valid: true,
    mode: session.mode,
    sources: {
      vision: session.sources.vision,
      behavior: session.sources.behavior,
      ratings: session.sources.ratings,
    },
    status: session.status,
    started_at: session.started_at,
    ended_at: session.ended_at,
    duration_ms: session.duration_ms,
    provenance: visionProvenance(session.mode),
    missingness: membership.missingness,
    camera_source_present: membership.camera_source_present,
    ocular_observations_present: membership.ocular_observations_present,
    usable_for_ocular: membership.camera_source_present && membership.ocular_observations_present,
    usable_for_behavior: protocol_id === PROTOCOL_GO_NO_GO_V1 && session.sources.behavior === 'human',
    sidecar_mission: sidecar,
    window_origin: membership.window_origin,
    task_window_ids: membership.windows.map((window) => window.window_id),
    behavior_summary: {
      median_reaction_ms: behavior.median_reaction_ms,
      accuracy: behavior.accuracy,
      valid_trial_count: behavior.valid_trial_count,
    },
    fatigue_pre: session.fatigue_pre ?? null,
    fatigue_post: session.fatigue_post ?? null,
    consent_version: session.consent?.version ?? null,
  };
}

function limitationsFor(sessions, windows, observations) {
  const lines = [...DATASET_LIMITATIONS];
  if (windows.some((window) => window.window_origin === WINDOW_ORIGIN.SESSION_FALLBACK)) {
    lines.push('At least one window used window_origin session_fallback; that envelope is not a measured task boundary.');
  }
  if (sessions.some((session) => session.mode === 'simulated' || session.sources.vision === 'simulated')) {
    lines.push('Dataset includes simulated vision; those rows are stratified and are not camera evidence.');
  }
  if (windows.some((window) => window.scientific_review === SCIENTIFIC_REVIEW.PENDING)) {
    lines.push('Unsigned protocol slots are present and are not mapped to PVT or Go/No-Go trial semantics.');
  }
  const vision = new Set(sessions.map((session) => session.sources.vision));
  if (vision.has('camera') && vision.has('simulated')) {
    lines.push('Cohort mixes camera and simulated vision; ocular rows stay stratified.');
  }
  if (observations.some((observation) => observation.window_id == null)) {
    lines.push('Unassigned observations were retained with unassigned_reason.');
  }
  if (windows.some((window) => window.status === 'empty')) {
    lines.push('Empty windows were retained with observation_count 0.');
  }
  return lines;
}

export function buildDataset(inputs, options = {}) {
  const collected = collectValidatedSessions(inputs);
  if (!collected.ok) return collected;

  const dataset_id = options.dataset_id || DEFAULT_DATASET_ID;
  const sessions = [];
  const windows = [];
  const observations = [];
  const trials = [];
  const strata = emptyStrata();
  let local_only_sidecars_present = false;

  for (const session of collected.value.sessions) {
    const membership = assignMembership(session);
    const projected = projectSession(session, membership);
    sessions.push(projected);
    windows.push(...membership.windows);
    observations.push(...membership.observations);
    trials.push(...membership.trials);
    bump(strata.vision_source, session.sources.vision);
    bump(strata.mode, session.mode);
    bump(strata.status, session.status);
    bump(strata.window_origin, membership.window_origin);
    bump(strata.scientific_review, projected.scientific_review);
    if (session.mission) local_only_sidecars_present = true;
    for (const observation of membership.observations) {
      if (observation.quality) bump(strata.quality, observation.quality);
    }
  }

  sessions.sort((a, b) => a.session_id.localeCompare(b.session_id));
  windows.sort((a, b) => {
    if (a.session_id !== b.session_id) return a.session_id.localeCompare(b.session_id);
    if (a.start_ms !== b.start_ms) return a.start_ms - b.start_ms;
    return a.task_id.localeCompare(b.task_id);
  });
  observations.sort((a, b) => {
    if (a.session_id !== b.session_id) return a.session_id.localeCompare(b.session_id);
    if (a.acquired_elapsed_ms !== b.acquired_elapsed_ms) return a.acquired_elapsed_ms - b.acquired_elapsed_ms;
    return a.index - b.index;
  });
  trials.sort((a, b) => {
    if (a.session_id !== b.session_id) return a.session_id.localeCompare(b.session_id);
    if (a.onset_ms !== b.onset_ms) return a.onset_ms - b.onset_ms;
    return a.index - b.index;
  });

  const created_from = collected.value.documents;
  const input_fingerprint = sha256Canonical(created_from);
  const counts = {
    sessions: sessions.length,
    windows: windows.length,
    observations: observations.length,
    trials: trials.length,
    empty_windows: windows.filter((window) => window.status === 'empty').length,
    unassigned_observations: observations.filter((observation) => observation.window_id == null).length,
    identical_duplicates_dropped: collected.value.identical_duplicates_dropped,
    exclusions: {},
  };

  const manifestWithoutFingerprint = {
    contract_id: DATASET_MANIFEST_CONTRACT,
    contract_version: CONTRACT_VERSION,
    dataset_id,
    producer_id: PRODUCER_ID,
    producer_version: PRODUCER_VERSION,
    created_from,
    input_fingerprint,
    feature_definition_version: FEATURE_DEFINITION_VERSION,
    window_algorithm_version: DATASET_WINDOW_ALGORITHM,
    validator_version: DATASET_VALIDATE_CONTRACT,
    collection_schema_version: COLLECTION_SCHEMA_V1,
    allowed_protocols: [...ALLOWED_PROTOCOLS],
    allowed_modes: [...ALLOWED_MODES],
    mixing_policy: MIXING_POLICY,
    participant_split_key: PARTICIPANT_SPLIT_KEY,
    scientific_review: SCIENTIFIC_REVIEW.PENDING,
    scientific_eligibility: SCIENTIFIC_ELIGIBILITY.PENDING_REVIEW,
    local_only_sidecars_present,
    counts,
    strata,
    limitations: limitationsFor(sessions, windows, observations),
  };

  const payloadWithoutFingerprint = {
    sessions,
    windows,
    observations,
    trials,
    manifest: manifestWithoutFingerprint,
  };
  const output_fingerprint = sha256Canonical(payloadWithoutFingerprint);
  const manifest = { ...manifestWithoutFingerprint, output_fingerprint };
  const dataset = stripPrivacyFields({
    sessions,
    windows,
    observations,
    trials,
    manifest,
  });

  return {
    ok: true,
    value: dataset,
  };
}
