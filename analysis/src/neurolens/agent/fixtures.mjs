import {
  ALLOWED_METRIC_IDS,
  ANALYSIS_VERSION,
  ARTIFACT_KIND,
  PARTICIPANT_SCOPE,
  PROTOCOL_VERSIONS,
  SYNTHETIC_LIMIT,
} from './constants.mjs';
import { comparisonArtifactRef, createEvidenceArtifact } from './artifacts.mjs';

const CREATED_AT = '2026-10-19T00:00:00.000Z';
const NO_INFERENCE = 'Numbers are copied from the fixture catalog; no model inference was performed.';

const SESSION_A = Object.freeze({
  session_ref: 'fixture:session:a',
  protocol_version: PROTOCOL_VERSIONS.FIXTURE_V01,
  participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
  quality: Object.freeze({ usable: true, reason_codes: Object.freeze([]) }),
  metrics: Object.freeze([
    Object.freeze({ metric_id: 'reaction_time_median_ms', value: 320, unit: 'ms', n: 12 }),
    Object.freeze({ metric_id: 'accuracy', value: 0.75, unit: 'proportion', n: 12 }),
    Object.freeze({ metric_id: 'valid_trial_count', value: 12, unit: 'count', n: 12 }),
  ]),
  limitations: Object.freeze([SYNTHETIC_LIMIT, NO_INFERENCE]),
});

const SESSION_B = Object.freeze({
  session_ref: 'fixture:session:b',
  protocol_version: PROTOCOL_VERSIONS.FIXTURE_V01,
  participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
  quality: Object.freeze({ usable: true, reason_codes: Object.freeze([]) }),
  metrics: Object.freeze([
    Object.freeze({ metric_id: 'reaction_time_median_ms', value: 348, unit: 'ms', n: 12 }),
    Object.freeze({ metric_id: 'accuracy', value: 0.67, unit: 'proportion', n: 12 }),
    Object.freeze({ metric_id: 'valid_trial_count', value: 12, unit: 'count', n: 12 }),
  ]),
  limitations: Object.freeze([SYNTHETIC_LIMIT, NO_INFERENCE]),
});

const SESSION_LOW_QUALITY = Object.freeze({
  session_ref: 'fixture:session:low-quality',
  protocol_version: PROTOCOL_VERSIONS.FIXTURE_V01,
  participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
  quality: Object.freeze({
    usable: false,
    reason_codes: Object.freeze(['missing_feature', 'low_coverage']),
  }),
  metrics: Object.freeze([]),
  limitations: Object.freeze([
    SYNTHETIC_LIMIT,
    'Requested visual/task features are missing; do not impute a fatigue label.',
  ]),
});

const SESSION_OTHER_PROTOCOL = Object.freeze({
  session_ref: 'fixture:session:other-protocol',
  protocol_version: PROTOCOL_VERSIONS.FIXTURE_V02,
  participant_scope: PARTICIPANT_SCOPE.SINGLE_PSEUDONYMOUS,
  quality: Object.freeze({ usable: true, reason_codes: Object.freeze([]) }),
  metrics: Object.freeze([
    Object.freeze({ metric_id: 'reaction_time_median_ms', value: 301, unit: 'ms', n: 10 }),
    Object.freeze({ metric_id: 'accuracy', value: 0.8, unit: 'proportion', n: 10 }),
    Object.freeze({ metric_id: 'valid_trial_count', value: 10, unit: 'count', n: 10 }),
  ]),
  limitations: Object.freeze([
    SYNTHETIC_LIMIT,
    'Protocol fixture-protocol/0.2 is not comparable to fixture-protocol/0.1.',
  ]),
});

export const FIXTURE_SESSIONS = Object.freeze({
  [SESSION_A.session_ref]: SESSION_A,
  [SESSION_B.session_ref]: SESSION_B,
  [SESSION_LOW_QUALITY.session_ref]: SESSION_LOW_QUALITY,
  [SESSION_OTHER_PROTOCOL.session_ref]: SESSION_OTHER_PROTOCOL,
});

function summaryArtifact(session, artifactRef) {
  return createEvidenceArtifact({
    artifact_ref: artifactRef,
    artifact_kind: ARTIFACT_KIND.SESSION_SUMMARY,
    protocol_version: session.protocol_version,
    created_at: CREATED_AT,
    participant_scope: session.participant_scope,
    source_session_refs: [session.session_ref],
    quality: session.quality,
    metrics: session.metrics,
    limitations: session.limitations,
  });
}

const ARTIFACT_SUMMARY_A = summaryArtifact(SESSION_A, 'fixture:session-summary:a');
const ARTIFACT_SUMMARY_B = summaryArtifact(SESSION_B, 'fixture:session-summary:b');
const ARTIFACT_SUMMARY_OTHER = summaryArtifact(SESSION_OTHER_PROTOCOL, 'fixture:session-summary:other-protocol');

function comparisonArtifact(left, right, metricId) {
  const leftMetric = left.metrics.find((metric) => metric.metric_id === metricId);
  const rightMetric = right.metrics.find((metric) => metric.metric_id === metricId);
  return createEvidenceArtifact({
    artifact_ref: comparisonArtifactRef([left.session_ref, right.session_ref], metricId),
    artifact_kind: ARTIFACT_KIND.SESSION_COMPARISON,
    protocol_version: left.protocol_version,
    created_at: CREATED_AT,
    participant_scope: PARTICIPANT_SCOPE.TWO_PSEUDONYMOUS,
    source_session_refs: [left.session_ref, right.session_ref],
    quality: { usable: true, reason_codes: [] },
    metrics: [
      { metric_id: leftMetric.metric_id, value: leftMetric.value, unit: leftMetric.unit, n: leftMetric.n, session_ref: left.session_ref },
      { metric_id: rightMetric.metric_id, value: rightMetric.value, unit: rightMetric.unit, n: rightMetric.n, session_ref: right.session_ref },
    ],
    limitations: [SYNTHETIC_LIMIT, NO_INFERENCE, 'Comparison is descriptive only; no causal or diagnostic claim.'],
    extra_payload: {
      metric_id: metricId,
      analysis_version: ANALYSIS_VERSION,
    },
  });
}

const COMPARABLE_PAIRS = [[SESSION_A, SESSION_B]];
const COMPARISON_ARTIFACTS = COMPARABLE_PAIRS.flatMap(([left, right]) => (
  ALLOWED_METRIC_IDS.map((metricId) => comparisonArtifact(left, right, metricId))
));

export const FIXTURE_ARTIFACTS = Object.freeze(Object.fromEntries([
  ARTIFACT_SUMMARY_A,
  ARTIFACT_SUMMARY_B,
  ARTIFACT_SUMMARY_OTHER,
  ...COMPARISON_ARTIFACTS,
].map((artifact) => [artifact.artifact_ref, artifact])));

export const SESSION_SUMMARY_REFS = Object.freeze({
  [SESSION_A.session_ref]: ARTIFACT_SUMMARY_A.artifact_ref,
  [SESSION_B.session_ref]: ARTIFACT_SUMMARY_B.artifact_ref,
  [SESSION_OTHER_PROTOCOL.session_ref]: ARTIFACT_SUMMARY_OTHER.artifact_ref,
});

export const COMPARISON_REFS = Object.freeze(Object.fromEntries(
  COMPARABLE_PAIRS.flatMap(([left, right]) => (
    ALLOWED_METRIC_IDS.map((metricId) => [
      `${left.session_ref}|${right.session_ref}|${metricId}`,
      comparisonArtifactRef([left.session_ref, right.session_ref], metricId),
    ])
  )),
));

export function createFixtureStore() {
  const sessions = structuredClone(FIXTURE_SESSIONS);
  const artifacts = structuredClone(FIXTURE_ARTIFACTS);
  return Object.freeze({
    analysis_version: ANALYSIS_VERSION,
    data_origin: 'synthetic_fixture',
    access: 'synthetic_fixture_catalog',
    getSession(sessionRef) {
      return Object.hasOwn(sessions, sessionRef) ? structuredClone(sessions[sessionRef]) : null;
    },
    hasSession(sessionRef) {
      return Object.hasOwn(sessions, sessionRef);
    },
    getArtifact(artifactRef) {
      return Object.hasOwn(artifacts, artifactRef) ? structuredClone(artifacts[artifactRef]) : null;
    },
    hasArtifact(artifactRef) {
      return Object.hasOwn(artifacts, artifactRef);
    },
    summaryRefFor(sessionRef) {
      return SESSION_SUMMARY_REFS[sessionRef] ?? null;
    },
    comparisonRefFor(sessionRefs, metricId) {
      return COMPARISON_REFS[`${sessionRefs.join('|')}|${metricId}`] ?? null;
    },
  });
}
