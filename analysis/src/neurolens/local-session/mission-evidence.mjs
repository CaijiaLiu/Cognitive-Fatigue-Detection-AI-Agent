// Browser-only/read-only bridge. Reuse the exact preview summaries; never coerce into V1.
import { taskSummary } from '../../../../previews/mission/dist/mission.js';

export const LOCAL_EVIDENCE_VERSION = 'mission-local-evidence/0.1';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };

export function readMissionEvidence(s) {
  if (!object(s) || s.schema_version !== 'mission-preview-1' || s.protocol_version !== 'mission-exploratory-v1') fail('Unsupported schema/protocol. Select a mission-preview-1 JSON, not V1 or a public dataset.');
  if (!uuid.test(s.session_id) || !['completed','interrupted'].includes(s.status)) fail('Only saved completed/interrupted sessions are supported.');
  if (!['camera','behavior','simulated'].includes(s.mode) || !['pilot','demo'].includes(s.purpose)) fail('Unknown mode/purpose.');
  const vision = s.mode === 'camera' ? 'camera' : s.mode === 'simulated' ? 'simulated' : 'unavailable';
  if (s.sources?.vision !== vision || s.sources?.behavior !== 'human' || s.sources?.ratings !== 'self_report') fail('Inconsistent source labels.');
  if (!s.consent?.local_only || !Number.isFinite(Date.parse(s.consent.accepted_at)) || s.upload_consent !== false) fail('Missing local-only consent/provenance.');
  const start = Date.parse(s.started_at), end = Date.parse(s.ended_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) fail('Invalid session timestamps.');
  if (!object(s.ratings)) fail('Missing ratings object.');
  const ratings = Object.fromEntries(['pre','between','post'].map(stage => {
    const value = s.ratings[stage];
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 10)) fail('Invalid fatigue self-rating.');
    return [stage,value];
  }));
  if (!Array.isArray(s.tasks) || s.tasks.length > 2 || !s.tasks.length) fail('No supported finished tasks.');
  if (s.status === 'completed' && (s.tasks.length !== 2 || Object.values(ratings).some(x => x === null))) fail('Completed session is missing tasks or ratings.');
  const warnings = [];
  const tasks = s.tasks.map((t, index) => {
    if (!object(t) || t.kind !== ['pvt','attention'][index] || !['completed','interrupted'].includes(t.status)
        || t.protocol !== (t.kind === 'pvt' ? 'pvt-web-exploratory-v1' : 'go-no-go-v1-game-skin')
        || !finite(t.duration_ms) || t.duration_ms < 0 || t.duration_ms > 900000
        || !Array.isArray(t.trials) || t.trials.length > 10000) fail('Invalid task identity, duration or trials.');
    if (s.status === 'completed' && t.status !== 'completed') fail('Conflicting session/task status.');
    const trials = t.trials.map((r, i) => {
      const allowed = t.kind === 'pvt' ? ['signal','false-start'] : ['go','no-go'];
      if (!object(r) || r.index !== i || !allowed.includes(r.type) || r.source !== 'human'
          || typeof r.responded !== 'boolean' || typeof r.correct !== 'boolean'
          || !(r.invalid_reason === null || (typeof r.invalid_reason === 'string' && r.invalid_reason.length <= 100))
          || !finite(r.onset_ms) || r.onset_ms < 0 || r.onset_ms > t.duration_ms) fail('Invalid trial/provenance.');
      if (r.type === 'false-start') {
        if (!r.responded || r.correct || r.reaction_ms !== null || r.deadline_ms !== null
            || !finite(r.response_ms) || r.response_ms < r.onset_ms || r.response_ms > t.duration_ms) fail('Invalid false start.');
      } else {
        const limit = t.kind === 'pvt' ? 10000 : 1000;
        if (!finite(r.deadline_ms) || Math.abs(r.deadline_ms - r.onset_ms - limit) > .01) fail('Invalid response deadline.');
        if (r.responded) {
          if (!finite(r.reaction_ms) || r.reaction_ms < 0 || !finite(r.response_ms)
              || Math.abs(r.response_ms - r.onset_ms - r.reaction_ms) > .01
              || r.response_ms > t.duration_ms || r.response_ms > r.deadline_ms + .01) fail('Invalid response timing.');
        } else if (r.reaction_ms !== null || r.response_ms !== null) fail('Missing response must stay null.');
        const correct = !r.invalid_reason && (r.type === 'no-go' ? !r.responded : r.responded && r.reaction_ms >= 100);
        if (r.correct !== !!correct) fail('Trial correctness contradicts response.');
      }
      return { type:r.type, responded:r.responded, correct:r.correct, reaction_ms:r.reaction_ms, invalid_reason:r.invalid_reason };
    });
    const summary = taskSummary(t.kind,trials);
    if (object(t.behavior_summary) && Object.keys(summary).some(key => t.behavior_summary[key] !== summary[key])) warnings.push(`${t.kind}: saved summary differs; displayed values are recalculated from trials.`);
    return { kind:t.kind, protocol:t.protocol, status:t.status, duration_ms:t.duration_ms, summary };
  });
  return {
    evidence_version:LOCAL_EVIDENCE_VERSION, source_schema:s.schema_version, protocol:s.protocol_version,
    session_ref:s.session_id, started_at:s.started_at, status:s.status, purpose:s.purpose, mode:s.mode,
    sources:{ vision, behavior:'human', ratings:'self_report' }, ratings, tasks, warnings,
    limitations:[
      'Descriptive local results only; no model, LLM call, upload, diagnosis or fatigue prediction.',
      'PVT-inspired and Go/No-Go game protocols are exploratory, not validated clinical tests.',
      'Demo-purpose and simulated-vision records must not be treated as empirical camera validation.',
      'Self-ratings are subjective and missing ratings stay missing; they are not verified fatigue labels.',
      'Camera/eye measurements are not interpreted by this bridge; no raw samples or participant ID are in this evidence.',
      'Separate task-relative clocks cannot reconstruct intermissions; do not pool tasks or compare protocols automatically.',
    ],
  };
}

export function parseMissionJSON(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) fail('JSON exceeds the 2 MB local import limit.');
  const value = JSON.parse(text);
  return readMissionEvidence(value);
}

export function answerLocalQuestion(evidence, question) {
  if (!evidence || evidence.evidence_version !== LOCAL_EVIDENCE_VERSION) fail('No validated local evidence.');
  const refs = evidence.tasks.map(t => `${evidence.session_ref}/tasks/${t.kind}`);
  if (question === 'performance') return { status:'answered', answer:'Task results recalculated from recorded trials. Tasks remain separate; this is not a fatigue score.', tasks:evidence.tasks, source_refs:refs };
  if (question === 'ratings') return { status:'answered', answer:'Before / between / after fatigue self-ratings. Missing values are not imputed.', ratings:evidence.ratings, source_refs:[`${evidence.session_ref}/ratings`] };
  return { status:'abstained', answer:'These results cannot establish whether you are fatigued. No validated fatigue prediction model is connected.', source_refs:[] };
}
