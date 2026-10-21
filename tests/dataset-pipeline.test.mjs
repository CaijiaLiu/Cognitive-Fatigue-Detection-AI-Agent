import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeTrials } from '../public/collection/tasks/summary.js';
import {
  REASON_CODES,
  SCIENTIFIC_ELIGIBILITY,
  SCIENTIFIC_REVIEW,
  WINDOW_ORIGIN,
  buildDataset,
  datasetPrivacyLeaks,
  toCanonicalJson,
} from '../analysis/src/neurolens/dataset/index.mjs';
import {
  PRIVACY_SECRETS,
  SECRET_PARTICIPANT_ID,
  cameraSessionA,
  cameraWithoutOcularSession,
  conflictingDuplicateSession,
  dropoutMissingEarSession,
  emptyWindowSession,
  endExclusiveSession,
  interruptedSession,
  invertedTimestampSession,
  lateProcessedSession,
  missionPreviewSession,
  missionSidecarSession,
  missingIdentitySession,
  mixedSourcesSession,
  orchestrationSidecarSession,
  overlappingMissionSession,
  simulatedVisionSession,
  unknownSchemaSession,
} from '../analysis/fixtures/datasets/synthetic.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CLI = join(ROOT, '../analysis/src/neurolens/dataset/cli.mjs');
const DATASET_DIR = join(ROOT, '../analysis/src/neurolens/dataset');

function doc(value, label = 'session.json') {
  return { label, value };
}

function built(...sessions) {
  return buildDataset(sessions.map((session, index) => doc(session, `session-${index}.json`)));
}

function assertRejected(result, reason) {
  assert.equal(result.ok, false, result.message ?? 'expected rejection');
  assert.equal(result.reason_code, reason);
}

test('1. Valid V1 Go/No-Go', () => {
  const session = cameraSessionA();
  const result = built(session);
  assert.equal(result.ok, true);
  assert.equal(result.value.sessions.length, 1);
  assert.equal(result.value.windows.length, 1);
  const window = result.value.windows[0];
  assert.equal(window.start_ms, 0);
  assert.equal(window.end_ms, session.duration_ms);
  assert.equal(window.kind, 'go-no-go');
  const expected = summarizeTrials(session.trials);
  assert.deepEqual(result.value.sessions[0].behavior_summary, {
    median_reaction_ms: expected.median_reaction_ms,
    accuracy: expected.accuracy,
    valid_trial_count: expected.valid_trial_count,
  });
  assert.equal(result.value.trials.length, session.trials.length);
});

test('2. Valid V1 + mission sidecar', () => {
  const result = built(missionSidecarSession());
  assert.equal(result.ok, true);
  assert.equal(result.value.windows.length, 1);
  assert.equal(result.value.windows[0].window_origin, WINDOW_ORIGIN.MISSION_SIDECAR);
  assert.equal(result.value.windows[0].start_ms, 1000);
  assert.equal(result.value.windows[0].end_ms, 50000);
  assert.equal(result.value.manifest.local_only_sidecars_present, true);
  assert.ok(result.value.observations.every((observation) => observation.window_id === result.value.windows[0].window_id));
});

test('3. Invalid schema', () => {
  assertRejected(built(unknownSchemaSession()), REASON_CODES.UNSUPPORTED_SCHEMA);
  assertRejected(built(orchestrationSidecarSession()), REASON_CODES.UNSUPPORTED_SCHEMA);
});

test('4. Missing identity', () => {
  assertRejected(built(missingIdentitySession()), REASON_CODES.MALFORMED_OUTPUT);
});

test('5. Duplicate sessions', () => {
  const first = cameraSessionA();
  const identical = cameraSessionA();
  const kept = built(first, identical);
  assert.equal(kept.ok, true);
  assert.equal(kept.value.sessions.length, 1);
  assert.equal(kept.value.manifest.counts.identical_duplicates_dropped, 1);

  const conflict = buildDataset([
    doc(cameraSessionA(), 'a.json'),
    doc(conflictingDuplicateSession(), 'b.json'),
  ]);
  assertRejected(conflict, REASON_CODES.SESSION_MISMATCH);
});

test('6. Invalid timestamps', () => {
  assertRejected(built(invertedTimestampSession()), REASON_CODES.MALFORMED_OUTPUT);
  const negative = cameraSessionA();
  negative.samples[0].elapsed_ms = -5;
  assertRejected(built(negative), REASON_CODES.MALFORMED_OUTPUT);
});

test('7. Overlapping windows', () => {
  assertRejected(built(overlappingMissionSession()), REASON_CODES.INCONSISTENT_EVIDENCE);
});

test('8. Preview rejection', () => {
  assertRejected(built(missionPreviewSession()), REASON_CODES.INCOMPATIBLE_PROTOCOL);
});

test('9. Dropout and missing EAR', () => {
  const result = built(dropoutMissingEarSession());
  assert.equal(result.ok, true);
  const byQuality = Object.fromEntries(result.value.observations.map((observation) => [observation.quality, observation]));
  assert.equal(byQuality.tracking_gap.eye_aspect_ratio, null);
  assert.equal(byQuality.eyes_unavailable.eye_aspect_ratio, null);
  assert.equal(byQuality.valid.eye_aspect_ratio, 0.28);
  assert.equal(result.value.sessions[0].missingness.tracking_gap, 1);
  assert.equal(result.value.sessions[0].missingness.eyes_unavailable, 1);
  const text = toCanonicalJson(result.value);
  assert.equal(text.includes('"eye_aspect_ratio": 0,'), false);
  assert.equal(text.includes('"interpreted_as_open_eyes": true'), false);
});

test('10. Mixed sources inside one session', () => {
  assertRejected(built(mixedSourcesSession()), REASON_CODES.INCONSISTENT_EVIDENCE);
});

test('11. Mixed camera/simulated cohort stratification', () => {
  const result = built(cameraSessionA(), simulatedVisionSession());
  assert.equal(result.ok, true);
  assert.equal(result.value.manifest.mixing_policy, 'stratify_by_vision_source');
  assert.equal(result.value.manifest.strata.vision_source.camera, 1);
  assert.equal(result.value.manifest.strata.vision_source.simulated, 1);
  assert.equal(Object.hasOwn(result.value, 'ocular_pool'), false);
  assert.equal(Object.hasOwn(result.value.manifest, 'ocular_pool'), false);
  const simulated = result.value.sessions.find((session) => session.mode === 'simulated');
  assert.equal(simulated.usable_for_ocular, false);
  assert.ok(result.value.manifest.limitations.some((line) => line.includes('stratified')));
});

test('12. Late processed observations', () => {
  const result = built(lateProcessedSession());
  assert.equal(result.ok, true);
  const observation = result.value.observations[0];
  assert.equal(observation.acquired_elapsed_ms, 500);
  assert.equal(observation.processed_elapsed_ms, 90000);
  assert.equal(observation.window_id, result.value.windows[0].window_id);
  assert.equal(observation.unassigned_reason, null);
});

test('13. End-exclusive boundaries', () => {
  const result = built(endExclusiveSession());
  assert.equal(result.ok, true);
  const byAcquired = Object.fromEntries(
    result.value.observations.map((observation) => [observation.acquired_elapsed_ms, observation]),
  );
  assert.equal(byAcquired[0].window_id, result.value.windows[0].window_id);
  assert.equal(byAcquired[999].window_id, result.value.windows[0].window_id);
  assert.equal(byAcquired[1000].window_id, null);
  assert.equal(byAcquired[1000].unassigned_reason, 'post_task');
});

test('14. Empty windows', () => {
  const result = built(emptyWindowSession());
  assert.equal(result.ok, true);
  const empty = result.value.windows.find((window) => window.status === 'empty');
  assert.ok(empty);
  assert.equal(empty.observation_count, 0);
  assert.equal(empty.start_ms, 40000);
  assert.equal(result.value.manifest.counts.empty_windows, 1);
});

test('15. Interrupted sessions', () => {
  const result = built(interruptedSession());
  assert.equal(result.ok, true);
  assert.equal(result.value.sessions[0].status, 'interrupted');
  assert.equal(result.value.windows[0].end_ms, null);
  assert.equal(result.value.windows[0].status, 'interrupted');
  assert.equal(result.value.sessions[0].status === 'completed', false);
});

test('16. Fallback window origin', () => {
  const result = built(cameraSessionA());
  assert.equal(result.ok, true);
  assert.equal(result.value.windows[0].window_origin, WINDOW_ORIGIN.SESSION_FALLBACK);
  assert.ok(result.value.manifest.limitations.some((line) => line.includes('not a measured task boundary')));
});

test('17. Camera present without valid ocular data', () => {
  const result = built(cameraWithoutOcularSession());
  assert.equal(result.ok, true);
  const session = result.value.sessions[0];
  assert.equal(session.camera_source_present, true);
  assert.equal(session.ocular_observations_present, false);
  assert.equal(session.usable_for_ocular, false);
});

test('18. Engineering vs scientific eligibility', () => {
  const result = built(cameraSessionA());
  assert.equal(result.ok, true);
  const session = result.value.sessions[0];
  assert.equal(session.engineering_valid, true);
  assert.equal(session.scientific_eligibility, SCIENTIFIC_ELIGIBILITY.PENDING_REVIEW);
  assert.equal(session.scientific_review, SCIENTIFIC_REVIEW.V1_EXISTING);
  assert.equal(result.value.manifest.scientific_eligibility, SCIENTIFIC_ELIGIBILITY.PENDING_REVIEW);
  assert.equal(result.value.manifest.scientific_review, SCIENTIFIC_REVIEW.PENDING);
});

test('19. Byte-identical repeated builds', () => {
  const inputs = [doc(cameraSessionA(), 'a.json'), doc(missionSidecarSession(), 'b.json')];
  const first = buildDataset(inputs);
  const second = buildDataset(inputs);
  assert.equal(first.ok, true);
  assert.equal(toCanonicalJson(first.value), toCanonicalJson(second.value));
  assert.equal(first.value.manifest.output_fingerprint, second.value.manifest.output_fingerprint);
});

test('20. CLI fail-closed behavior', () => {
  const out = mkdtempSync(join(tmpdir(), 'nl-dataset-'));
  const invalidPath = join(out, 'preview.json');
  writeFileSync(invalidPath, JSON.stringify(missionPreviewSession()));
  const failed = spawnSync(process.execPath, [CLI, 'build', '--in', invalidPath, '--out', join(out, 'dataset')], {
    encoding: 'utf8',
  });
  assert.equal(failed.status, 3);
  assert.equal(existsSync(join(out, 'dataset', 'dataset.json')), false);
  assert.equal(existsSync(join(out, 'dataset', 'manifest.json')), false);

  const validPath = join(out, 'valid.json');
  const validOut = join(out, 'ok');
  writeFileSync(validPath, JSON.stringify(cameraSessionA()));
  const okRun = spawnSync(process.execPath, [CLI, 'build', '--in', validPath, '--out', validOut], {
    encoding: 'utf8',
  });
  assert.equal(okRun.status, 0, okRun.stderr);
  const written = JSON.parse(readFileSync(join(validOut, 'dataset.json'), 'utf8'));
  assert.equal(written.manifest.output_fingerprint.length, 64);

  const mixedOut = join(out, 'mixed');
  const mixed = spawnSync(
    process.execPath,
    [CLI, 'build', '--in', validPath, invalidPath, '--out', mixedOut],
    { encoding: 'utf8' },
  );
  assert.equal(mixed.status, 3);
  assert.equal(existsSync(join(mixedOut, 'dataset.json')), false);
});

test('21. Privacy redaction', () => {
  const result = built(cameraSessionA());
  assert.equal(result.ok, true);
  assert.deepEqual(datasetPrivacyLeaks(result.value, PRIVACY_SECRETS), []);
  const text = toCanonicalJson(result.value);
  for (const secret of PRIVACY_SECRETS) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.equal(text.includes('"user_agent"'), false);
  assert.equal(text.includes('"withdrawal_token"'), false);
  assert.equal(text.includes('"upload_token"'), false);
  assert.equal(result.value.sessions[0].participant_ref, SECRET_PARTICIPANT_ID);
});

test('22. No network calls', () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    throw new Error('network is forbidden in the dataset builder');
  };
  try {
    const result = built(cameraSessionA(), simulatedVisionSession());
    assert.equal(result.ok, true);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
  }

  for (const name of readdirSync(DATASET_DIR)) {
    if (!name.endsWith('.mjs')) continue;
    const source = readFileSync(join(DATASET_DIR, name), 'utf8');
    assert.equal(/\bfetch\s*\(/.test(source), false, name);
    assert.equal(/from ['"]openai['"]/.test(source), false, name);
    assert.equal(/wrangler|cloudflare:d1|process\.env\.OPENAI/i.test(source), false, name);
  }
});
