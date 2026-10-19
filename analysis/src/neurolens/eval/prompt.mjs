import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_METRICS,
  ALLOWED_TOOLS,
  ANALYSIS_VERSION,
  ANSWER_VERSION,
  CONTRACT_VERSION,
  composeAnswer,
  createAnalysisTools,
  createFixtureStore,
} from '../agent/index.mjs';
import { PACKAGE_VERSION, PROMPT_VERSION, REQUIRED_PROMPT_SECTIONS } from './constants.mjs';

const PROMPT_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../prompts/research-agent-prompt-0.1.md');

export function loadSystemPrompt() {
  return readFileSync(PROMPT_PATH, 'utf8').trim();
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function analysisVersionFor(intent, tools) {
  return intent.analysis_version ?? tools?.analysis_version ?? ANALYSIS_VERSION;
}

function requestsFromIntent(intent, tools) {
  const analysis_version = analysisVersionFor(intent, tools);
  if (intent.kind === 'report_metric') {
    return [{
      tool: 'get_session_summary',
      session_ref: intent.session_ref,
      analysis_version,
    }];
  }
  if (intent.kind === 'compare_metric') {
    return [{
      tool: 'compare_sessions',
      session_refs: intent.session_refs,
      metric_id: intent.metric_id,
      analysis_version,
    }];
  }
  if (intent.kind === 'lookup_artifact') {
    return [{ tool: 'get_evidence', artifact_ref: intent.artifact_ref }];
  }
  return [];
}

export function collectEvidence(caseDef, tools) {
  const requests = caseDef.tool_requests ?? requestsFromIntent(caseDef.intent, tools);
  const envelopes = requests.map((request) => tools.invoke(request));
  const artifacts = [];
  for (const envelope of envelopes) {
    if (envelope.status === 'ok' && envelope.artifact_ref) {
      const artifact = tools.inspectArtifact(envelope.artifact_ref);
      if (artifact) artifacts.push(artifact);
    }
  }
  return { requests, envelopes, artifacts };
}

export function toolManifest(tools) {
  const listed = tools?.listTools?.() ?? [];
  return {
    contract_version: CONTRACT_VERSION,
    analysis_version: tools?.analysis_version ?? ANALYSIS_VERSION,
    access: listed[0]?.access ?? 'synthetic_fixture_catalog',
    read_only: true,
    tools: ALLOWED_TOOLS.map((name) => ({
      name,
      read_only: true,
      request_keys: name === 'get_session_summary'
        ? ['tool', 'session_ref', 'analysis_version']
        : name === 'compare_sessions'
          ? ['tool', 'session_refs', 'metric_id', 'analysis_version']
          : ['tool', 'artifact_ref'],
    })),
    allowed_metrics: ALLOWED_METRICS,
    note: 'Tools were already executed offline. Use only the validated evidence below. Do not invent tool results, paths, URLs, or SQL.',
  };
}

export function answerSchemaSection() {
  return [
    `Return exactly one ${ANSWER_VERSION} JSON object.`,
    'Answered claims must copy metric_id, value, and unit from a cited artifact.',
    'Abstained answers have empty claims and a reason_code.',
    'Do not add extra top-level fields.',
  ].join(' ');
}

export function scientificLimitations(caseDef) {
  return [
    'Synthetic fixture catalog only; not empirical evidence and not camera-validated.',
    'Metric identifiers are proposed names pending scientific review.',
    'No ADHD diagnosis, fatigue score, or medical conclusion is permitted.',
    'Insufficient or incompatible evidence requires abstention.',
    ...(caseDef.extra_limitations ?? []),
  ];
}

export function renderUserPrompt(sections) {
  return [
    '## User question',
    sections.question,
    '',
    '## Tool manifest',
    stableJson(sections.tool_manifest),
    '',
    '## Validated evidence',
    stableJson(sections.validated_evidence),
    '',
    '## Answer schema',
    sections.answer_schema,
    '',
    '## Scientific limitations',
    sections.scientific_limitations.map((line, index) => `${index + 1}. ${line}`).join('\n'),
    '',
    'Reply with JSON only.',
  ].join('\n');
}

export function overlayValidatedEvidence(pkg, { artifacts, tool_envelopes } = {}) {
  const nextArtifacts = artifacts ?? pkg.artifacts;
  const sections = {
    ...pkg.sections,
    validated_evidence: {
      tool_envelopes: tool_envelopes ?? pkg.sections.validated_evidence.tool_envelopes,
      artifacts: nextArtifacts,
    },
  };
  return {
    ...pkg,
    sections,
    artifacts: nextArtifacts,
    user_prompt: renderUserPrompt(sections),
  };
}

export function buildPromptPackage(caseDef, { tools } = {}) {
  if (!caseDef || typeof caseDef !== 'object' || !caseDef.id) {
    throw new Error('Evaluation case is required.');
  }
  const agent = tools ?? createAnalysisTools({ store: createFixtureStore() });
  const evidence = collectEvidence(caseDef, agent);
  const gold = composeAnswer(caseDef.intent, agent);
  const sections = {
    question: caseDef.question,
    tool_manifest: toolManifest(agent),
    validated_evidence: {
      tool_envelopes: evidence.envelopes,
      artifacts: evidence.artifacts,
    },
    answer_schema: answerSchemaSection(),
    scientific_limitations: scientificLimitations(caseDef),
  };
  const missing = REQUIRED_PROMPT_SECTIONS.filter((key) => sections[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Prompt package missing sections: ${missing.join(', ')}`);
  }
  return {
    package_version: PACKAGE_VERSION,
    prompt_version: PROMPT_VERSION,
    contract_version: CONTRACT_VERSION,
    case_id: caseDef.id,
    category: caseDef.category,
    system_prompt: loadSystemPrompt(),
    user_prompt: renderUserPrompt(sections),
    sections,
    expected: {
      status: gold.status,
      reason_code: gold.reason_code,
      claims: gold.claims,
      limitations: gold.limitations,
    },
    artifacts: evidence.artifacts,
    extra_artifacts: (caseDef.extra_evidence_refs ?? [])
      .map((ref) => agent.inspectArtifact(ref))
      .filter(Boolean),
    validation: {
      expectedSessionRefs: caseDef.validation?.expectedSessionRefs ?? [],
      coverage: caseDef.validation?.coverage ?? 'any',
    },
    sample_failures: caseDef.sample_failures ?? [],
  };
}

export function renderPastePrompt(pkg) {
  return [
    pkg.system_prompt,
    '',
    '---',
    '',
    pkg.user_prompt,
  ].join('\n');
}

export function publicCaseMeta(pkg) {
  return {
    package_version: pkg.package_version,
    prompt_version: pkg.prompt_version,
    contract_version: pkg.contract_version,
    case_id: pkg.case_id,
    category: pkg.category,
    validation: pkg.validation,
    note: 'Do not paste this file into the model. Gold answers are omitted on purpose.',
  };
}
