/**
 * Offline reliability runner over the existing validator and prompt builder.
 * Unexpected outcomes fail the suite. This is not an LLM robustness benchmark.
 */
import { ANSWER_VERSION, REASON_CODES } from '../agent/constants.mjs';
import {
  ADVERSARIAL_CATEGORIES,
  INJECTION_PAYLOAD,
  RELIABILITY_LIMIT,
  RELIABILITY_REPORT_VERSION,
} from './constants.mjs';
import { IDS, missingRtSession } from '../../../fixtures/exports/synthetic.mjs';
import { ADVERSARIAL_CASES, answered, getAdversarialCase } from './adversarial.mjs';
import { getEvalCase } from './cases.mjs';
import { evaluateAnswer } from './harness.mjs';
import { exportMetricCase, runOfflinePipeline } from './pipeline.mjs';
import { buildPromptPackage, overlayValidatedEvidence } from './prompt.mjs';

const NOW_DEFAULT = '2026-10-19T05:00:00.000Z';

function resolveCaseDef(entry) {
  if (entry && typeof entry === 'object' && entry.intent) return entry;
  if (typeof entry === 'string') return getEvalCase(entry);
  return null;
}

function packageFor(spec) {
  const caseDef = resolveCaseDef(spec.eval_case);
  if (!caseDef) {
    throw new Error(`Unknown evaluation case for ${spec.id}`);
  }
  const pkg = buildPromptPackage(caseDef);
  if (!spec.extra_eval_case) return pkg;
  const extra = buildPromptPackage(resolveCaseDef(spec.extra_eval_case));
  return {
    ...pkg,
    extra_artifacts: [...(pkg.extra_artifacts ?? []), ...extra.artifacts, ...(extra.extra_artifacts ?? [])],
  };
}

function goldAnswer(expected) {
  const answer = {
    answer_version: ANSWER_VERSION,
    status: expected.status,
    claims: structuredClone(expected.claims),
    limitations: [...expected.limitations],
  };
  if (expected.reason_code) answer.reason_code = expected.reason_code;
  return answer;
}

function check(name, passed, detail) {
  return detail === undefined ? { name, passed } : { name, passed, detail };
}

function actualReason(report) {
  return report.validator.reason_code ?? report.parsed_answer?.reason_code;
}

function outcomeMatches(spec, report) {
  const expectedOk = spec.expect.validator_ok;
  const okPass = report.validator.ok === expectedOk;
  const reasonPass = !spec.expect.reason_code || actualReason(report) === spec.expect.reason_code;
  const statusPass = !spec.expect.status || report.parsed_answer?.status === spec.expect.status;
  return { okPass, reasonPass, statusPass, passed: okPass && reasonPass && statusPass };
}

function record(spec, report, extraChecks = []) {
  const match = outcomeMatches(spec, report);
  const checks = [
    check('validator_ok', match.okPass, `expected ${spec.expect.validator_ok}`),
    check('reason_code', match.reasonPass, `expected ${spec.expect.reason_code ?? 'any'}`),
    ...extraChecks,
  ];
  if (spec.expect.status) {
    checks.push(check('status', match.statusPass, `expected ${spec.expect.status}`));
  }
  return {
    id: spec.id,
    category: spec.category,
    kind: spec.kind,
    title: spec.title,
    passed: match.passed && extraChecks.every((item) => item.passed),
    expected: spec.expect,
    actual: {
      validator_ok: report.validator.ok,
      reason_code: actualReason(report),
      status: report.parsed_answer?.status,
      result: report.result,
    },
    checks,
    validator: report.validator,
  };
}

function userPromptSections(userPrompt) {
  const blocks = userPrompt.split(/^## /m).slice(1);
  const sections = {};
  for (const block of blocks) {
    const newline = block.indexOf('\n');
    const title = (newline === -1 ? block : block.slice(0, newline)).trim();
    const body = newline === -1 ? '' : block.slice(newline + 1);
    sections[title] = body;
  }
  return sections;
}

function runPromptBoundary(spec, options) {
  const base = packageFor(spec);
  const injectedArtifacts = base.artifacts.map((artifact, index) => {
    if (index !== 0) return artifact;
    return {
      ...artifact,
      limitations: [...artifact.limitations, spec.injection],
    };
  });
  const pkg = overlayValidatedEvidence(base, { artifacts: injectedArtifacts });
  const sections = userPromptSections(pkg.user_prompt);
  const evidence = sections['Validated evidence'] ?? '';
  const question = sections['User question'] ?? '';
  const schema = sections['Answer schema'] ?? '';
  const limitations = sections['Scientific limitations'] ?? '';
  const trusted = `${pkg.system_prompt}\n${schema}\n${limitations}`;
  const extraChecks = [
    check('injection_in_evidence', evidence.includes(spec.injection), 'Injection must appear in validated evidence.'),
    check('injection_not_in_system', !pkg.system_prompt.includes(spec.injection), 'Injection must not enter the system prompt.'),
    check(
      'injection_not_trusted_instruction',
      !trusted.includes(spec.injection),
      'Injection must not appear in trusted instruction sections.',
    ),
    check('trusted_rules_remain', /Do not produce ADHD diagnoses/.test(pkg.system_prompt), 'System rules must remain intact.'),
    check('evidence_section_present', Boolean(evidence.trim()), 'Validated evidence section is required.'),
    check('question_not_rewritten', question.includes(base.sections.question), 'User question must stay the original question.'),
  ];
  const report = evaluateAnswer(pkg, spec.diagnosis_answer, options);
  const row = record(spec, report, extraChecks);
  row.prompt_boundary = {
    injection: spec.injection,
    evidence_contains_injection: evidence.includes(spec.injection),
    system_contains_injection: pkg.system_prompt.includes(spec.injection),
    note: 'Section isolation is an engineering check. It does not prove LLM jailbreak resistance.',
  };
  return row;
}

function runAdversarialCase(spec, options) {
  if (spec.kind === 'prompt_boundary') {
    return runPromptBoundary(spec, options);
  }
  const pkg = packageFor(spec);
  if (spec.kind === 'accept_gold') {
    return record(spec, evaluateAnswer(pkg, goldAnswer(pkg.expected), { ...options, model_source: 'synthetic_gold' }));
  }
  return record(spec, evaluateAnswer(pkg, spec.answer, { ...options, model_source: 'synthetic_adversarial' }));
}

function metamorphicSpec(id, title, expect) {
  return {
    id,
    category: ADVERSARIAL_CATEGORIES.METAMORPHIC,
    kind: 'metamorphic',
    title,
    expect,
  };
}

export function runExportQualityCases(options = {}) {
  const now = options.now ?? NOW_DEFAULT;
  const caseDef = exportMetricCase(IDS.missingRt, {
    id: 'export-missing-features',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
    title: 'Missing required export metrics do not support a numeric claim',
    question: 'What is the median reaction time for the missing-RT export?',
  });
  const pipeline = runOfflinePipeline({
    exportInput: missingRtSession(),
    caseDef,
    now,
  });
  const gold = record(
    metamorphicSpec('quality-export-missing-features', 'Missing export features gold abstains', {
      validator_ok: true,
      status: 'abstained',
      reason_code: REASON_CODES.INSUFFICIENT_DATA,
    }),
    pipeline.report,
  );
  gold.category = ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY;
  gold.kind = 'accept_gold';
  const fabricated = record(
    {
      id: 'quality-export-missing-features-claim',
      category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
      kind: 'reject_answer',
      title: 'A numeric claim is rejected when export features are missing',
      expect: { validator_ok: false, reason_code: REASON_CODES.MISSING_EVIDENCE },
    },
    evaluateAnswer(pipeline.package, answered(), { now, model_source: 'synthetic_adversarial' }),
  );
  return [gold, fabricated];
}

export function runMetamorphicCases(options = {}) {
  const now = options.now ?? NOW_DEFAULT;
  const base = buildPromptPackage(getEvalCase('valid-metric-rt'));
  const gold = goldAnswer(base.expected);
  const other = buildPromptPackage(getEvalCase('incorrect-citation'));
  const artifactA = base.artifacts[0];
  const artifactB = other.extra_artifacts[0];

  const mutated = answered({ claim: { value: gold.claims[0].value + 1, text: 'The fixture reaction_time_median_ms is 321 ms.' } });
  const swapped = answered({
    claim: {
      value: 348,
      text: 'The fixture reaction_time_median_ms is 348 ms.',
      artifact_refs: ['fixture:session-summary:b'],
    },
  });
  const unsupported = answered({
    claim: {
      text: 'This participant has ADHD.',
      metric_id: 'reaction_time_median_ms',
      value: 320,
    },
  });

  const withBoth = {
    ...base,
    artifacts: [artifactA, artifactB],
    extra_artifacts: [],
  };
  const reordered = {
    ...base,
    artifacts: [artifactB, artifactA],
    extra_artifacts: [],
  };
  const removed = {
    ...base,
    artifacts: [],
    extra_artifacts: [],
  };

  const rows = [
    record(
      metamorphicSpec('meta-mutate-numeric', 'Changing a valid numeric claim without changing evidence invalidates the answer', {
        validator_ok: false,
        reason_code: REASON_CODES.NUMERIC_MISMATCH,
      }),
      evaluateAnswer(base, mutated, { now, model_source: 'synthetic_metamorphic' }),
    ),
    record(
      metamorphicSpec('meta-swap-citation', 'Replacing a valid citation with another session artifact invalidates the answer', {
        validator_ok: false,
        reason_code: REASON_CODES.SESSION_MISMATCH,
      }),
      evaluateAnswer(other, swapped, { now, model_source: 'synthetic_metamorphic' }),
    ),
    record(
      metamorphicSpec('meta-reorder-evidence', 'Reordering independent evidence artifacts does not change gold validity', {
        validator_ok: true,
        status: 'answered',
      }),
      evaluateAnswer(reordered, gold, { now, model_source: 'synthetic_metamorphic' }),
      [
        check(
          'order_independent',
          evaluateAnswer(withBoth, gold, { now, model_source: 'synthetic_metamorphic' }).result === 'pass'
            && evaluateAnswer(reordered, gold, { now, model_source: 'synthetic_metamorphic' }).result === 'pass',
          'Gold must pass for [A,B] and [B,A].',
        ),
      ],
    ),
    record(
      metamorphicSpec('meta-irrelevant-evidence', 'Adding irrelevant evidence does not authorize unsupported claims', {
        validator_ok: false,
        reason_code: REASON_CODES.UNSUPPORTED_CLAIM,
      }),
      evaluateAnswer(withBoth, unsupported, { now, model_source: 'synthetic_metamorphic' }),
      [
        check(
          'foreign_number_still_bound',
          evaluateAnswer(withBoth, swapped, { now, model_source: 'synthetic_metamorphic' }).validator.reason_code
            === REASON_CODES.SESSION_MISMATCH,
          'Session-B numbers stay unauthorized for a session-A question.',
        ),
      ],
    ),
    record(
      metamorphicSpec('meta-remove-required-evidence', 'Removing required evidence invalidates a previously supported claim', {
        validator_ok: false,
        reason_code: REASON_CODES.MISSING_EVIDENCE,
      }),
      evaluateAnswer(removed, gold, { now, model_source: 'synthetic_metamorphic' }),
    ),
  ];
  return rows;
}

function summarize(rows) {
  const by_category = {};
  for (const row of rows) {
    const bucket = by_category[row.category] ?? { total: 0, passed: 0, failed: 0 };
    bucket.total += 1;
    if (row.passed) bucket.passed += 1;
    else bucket.failed += 1;
    by_category[row.category] = bucket;
  }
  return {
    total: rows.length,
    passed: rows.filter((row) => row.passed).length,
    failed: rows.filter((row) => !row.passed).length,
    by_category,
  };
}

export function runReliabilitySuite(options = {}) {
  const now = options.now ?? NOW_DEFAULT;
  const includeMetamorphic = options.metamorphic !== false;
  const includeExport = options.exportQuality !== false;
  const adversarial = (options.cases ?? ADVERSARIAL_CASES).map((spec) => runAdversarialCase(spec, { now }));
  const exportQuality = includeExport ? runExportQualityCases({ now }) : [];
  const metamorphic = includeMetamorphic ? runMetamorphicCases({ now }) : [];
  const cases = [...adversarial, ...exportQuality, ...metamorphic];
  const summary = summarize(cases);
  return {
    report_version: RELIABILITY_REPORT_VERSION,
    evaluated_at: now,
    model_source: 'synthetic_adversarial',
    result: summary.failed === 0 ? 'pass' : 'fail',
    summary,
    cases,
    limitations: [
      RELIABILITY_LIMIT,
      'Validator rejection is not evidence that a live LLM would refuse the same prompt.',
      'Prompt-section isolation is not jailbreak resistance.',
      INJECTION_PAYLOAD ? 'Injection fixtures use synthetic evidence text only.' : undefined,
    ].filter(Boolean),
  };
}

export function formatReliabilitySummary(report) {
  const lines = [
    `NeuroLens reliability ${report.report_version}: ${report.result}`,
    `cases ${report.summary.passed}/${report.summary.total} expected`,
  ];
  for (const [category, bucket] of Object.entries(report.summary.by_category)) {
    lines.push(`  ${category}\t${bucket.passed}/${bucket.total}`);
  }
  for (const row of report.cases.filter((item) => !item.passed)) {
    lines.push(`FAIL ${row.id} expected ${row.expected.reason_code ?? row.expected.validator_ok} got ${row.actual.reason_code}`);
  }
  return `${lines.join('\n')}\n`;
}

export function getReliabilityCase(caseId) {
  return getAdversarialCase(caseId);
}
