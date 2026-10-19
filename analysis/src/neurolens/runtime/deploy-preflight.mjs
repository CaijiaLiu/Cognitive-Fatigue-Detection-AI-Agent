/**
 * Offline Sites preview preflight. Checks repository artifacts and declared
 * configuration. Does not prove remote D1 identity or Sites publication.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { loadAgentProviderConfig } from './config.mjs';
import { loadDemoSecurityConfig } from './demo-security.mjs';
import { DEMO_D1_CLEANUP_SQL, DEMO_D1_INCREMENT_SQL } from './demo-d1-sql.mjs';

export const PREVIEW_TEMPLATE_RELATIVE = 'docs/operations/preview.env.example';
export const WORKER_ENTRY_RELATIVE = 'build/sites-worker.ts';
export const HOSTING_RELATIVE = '.openai/hosting.json';
export const GENERATED_WRANGLER_RELATIVE = 'dist/server/wrangler.json';
export const REQUIRED_SECRET_NAMES = Object.freeze([
  'NEUROLENS_DEMO_PASSWORD',
  'NEUROLENS_DEMO_SESSION_SECRET',
  'NEUROLENS_DEMO_RATE_SECRET',
]);

const SYNTHETIC_PREVIEW_ENV = Object.freeze({
  NEUROLENS_DEMO_DEPLOYMENT: 'preview',
  NEUROLENS_DEMO_D1_ISOLATED: '1',
  NEUROLENS_DEMO_PASSWORD: 'preflight-password-1',
  NEUROLENS_DEMO_SESSION_SECRET: 'preflight-session-secret-32chars!',
  NEUROLENS_DEMO_RATE_SECRET: 'preflight-rate-16',
  NEUROLENS_AGENT_PROVIDER: 'mock',
});

function repoRoot() {
  return resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseEnvTemplate(text) {
  const values = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function row(id, status, detail) {
  return { id, status, detail };
}

export function evaluateDeployPreflight({
  root = repoRoot(),
  processEnv = {},
} = {}) {
  const rows = [];
  const hostingPath = join(root, HOSTING_RELATIVE);
  const templatePath = join(root, PREVIEW_TEMPLATE_RELATIVE);
  const workerPath = join(root, WORKER_ENTRY_RELATIVE);
  const wranglerPath = join(root, GENERATED_WRANGLER_RELATIVE);
  const packagePath = join(root, 'package.json');

  const hosting = existsSync(hostingPath) ? readJson(hostingPath) : null;
  const template = existsSync(templatePath) ? parseEnvTemplate(readFileSync(templatePath, 'utf8')) : null;
  const pkg = existsSync(packagePath) ? readJson(packagePath) : { scripts: {} };

  rows.push(row(
    'required_configuration_names',
    template && REQUIRED_SECRET_NAMES.every((name) => Object.hasOwn(template, name)) ? 'PASS' : 'FAIL',
    'Preview template must name password, session, and rate secrets without values.',
  ));

  rows.push(row(
    'preview_mode',
    template?.NEUROLENS_DEMO_DEPLOYMENT === 'preview' ? 'PASS' : 'FAIL',
    'docs/operations/preview.env.example must set NEUROLENS_DEMO_DEPLOYMENT=preview.',
  ));

  const provider = loadAgentProviderConfig({
    NEUROLENS_AGENT_PROVIDER: template?.NEUROLENS_AGENT_PROVIDER ?? processEnv.NEUROLENS_AGENT_PROVIDER,
  });
  rows.push(row(
    'mock_provider',
    provider.kind === 'mock' ? 'PASS' : 'FAIL',
    `Configured provider kind is ${provider.kind}.`,
  ));
  rows.push(row(
    'live_provider_disabled',
    template?.NEUROLENS_AGENT_ALLOW_LIVE !== '1'
      && processEnv.NEUROLENS_AGENT_ALLOW_LIVE !== '1'
      && processEnv.NEUROLENS_AGENT_ALLOW_LIVE !== 'true'
      ? 'PASS'
      : 'FAIL',
    'ALLOW_LIVE must stay unset for preview.',
  ));

  const previewConfig = loadDemoSecurityConfig(SYNTHETIC_PREVIEW_ENV);
  rows.push(row(
    'authentication_enabled',
    previewConfig.ok && previewConfig.auth_required ? 'PASS' : 'FAIL',
    previewConfig.error ?? 'Synthetic preview env requires a demo session.',
  ));
  rows.push(row(
    'd1_isolation_acknowledgement',
    template?.NEUROLENS_DEMO_D1_ISOLATED === '1' ? 'PASS' : 'FAIL',
    'Template must require NEUROLENS_DEMO_D1_ISOLATED=1.',
  ));

  const missingIsolated = loadDemoSecurityConfig({
    ...SYNTHETIC_PREVIEW_ENV,
    NEUROLENS_DEMO_D1_ISOLATED: '',
  });
  const livePreview = loadDemoSecurityConfig({
    ...SYNTHETIC_PREVIEW_ENV,
    NEUROLENS_AGENT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-preflight-not-used',
    NEUROLENS_AGENT_ALLOW_LIVE: '1',
  });
  rows.push(row(
    'preview_fail_closed',
    missingIsolated.ok === false && livePreview.ok === false ? 'PASS' : 'FAIL',
    'Preview without isolated D1 or with openai/ALLOW_LIVE must fail closed.',
  ));

  rows.push(row(
    'worker_entrypoint',
    existsSync(workerPath) ? 'PASS' : 'FAIL',
    `${WORKER_ENTRY_RELATIVE} must exist.`,
  ));
  rows.push(row(
    'binding_configuration',
    hosting?.d1 === 'DB' ? 'PASS' : 'FAIL',
    '.openai/hosting.json must declare d1=DB.',
  ));

  const scriptCommands = Object.values(pkg.scripts ?? {}).join('\n');
  const hasRemoteDeploy = /wrangler(?:\.js)?(?:\s+\S+)*\s+deploy\b/.test(scriptCommands);
  rows.push(row(
    'no_production_deploy_script',
    hasRemoteDeploy ? 'FAIL' : 'PASS',
    'package.json must not grow a remote wrangler deploy script.',
  ));

  let wranglerStatus = 'NOT_VERIFIED';
  let wranglerDetail = `${GENERATED_WRANGLER_RELATIVE} is generated by npm run build; absent until a local build.`;
  if (existsSync(wranglerPath)) {
    try {
      const wrangler = readJson(wranglerPath);
      const d1 = wrangler.d1_databases ?? wrangler.d1_database ?? [];
      const bindings = Array.isArray(d1) ? d1 : [d1];
      const hasDb = bindings.some((item) => item?.binding === 'DB');
      wranglerStatus = hasDb ? 'PASS' : 'FAIL';
      wranglerDetail = hasDb
        ? 'Generated wrangler binds DB. Remote database identity remains NOT_VERIFIED.'
        : 'Generated wrangler.json does not bind DB.';
    } catch {
      wranglerStatus = 'FAIL';
      wranglerDetail = 'Generated wrangler.json is unreadable.';
    }
  }
  rows.push(row('build_artifacts', wranglerStatus, wranglerDetail));

  rows.push(row(
    'demo_sql_scoped',
    /demo:sess:%/.test(DEMO_D1_CLEANUP_SQL) && /RETURNING/.test(DEMO_D1_INCREMENT_SQL) ? 'PASS' : 'FAIL',
    'Demo cleanup stays on demo: keys; increment uses RETURNING.',
  ));

  rows.push(row(
    'remote_d1_identity',
    'NOT_VERIFIED',
    'Offline preflight cannot see the hosted D1 UUID. Isolated preview D1 is not created here.',
  ));
  rows.push(row(
    'sites_publication',
    'NOT_VERIFIED',
    'Sites UI publication is outside this repository. Do not infer wrangler deploy support.',
  ));
  rows.push(row(
    'openai_key_absent_from_git',
    processEnv.OPENAI_API_KEY ? 'NOT_VERIFIED' : 'PASS',
    processEnv.OPENAI_API_KEY
      ? 'Process has OPENAI_API_KEY; preview must not receive it. Value is not printed.'
      : 'No OPENAI_API_KEY in this process.',
  ));

  const failed = rows.filter((item) => item.status === 'FAIL');
  return {
    ok: failed.length === 0,
    event: 'deploy_preflight',
    deploy_allowed: false,
    note: 'Offline preflight cannot authorize cloud changes. Remote identity stays NOT_VERIFIED.',
    rows,
  };
}

export function formatPreflight(report) {
  const lines = report.rows.map((item) => `${item.status} ${item.id} — ${item.detail}`);
  lines.push(JSON.stringify({
    event: report.event,
    ok: report.ok,
    deploy_allowed: report.deploy_allowed,
    note: report.note,
  }));
  return lines.join('\n');
}
