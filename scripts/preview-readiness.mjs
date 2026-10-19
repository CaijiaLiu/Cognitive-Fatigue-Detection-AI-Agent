#!/usr/bin/env node
/**
 * Print a deployment readiness classification. Never prints secret values.
 */
import { loadAgentProviderConfig } from '../analysis/src/neurolens/runtime/config.mjs';
import { loadDemoSecurityConfig } from '../analysis/src/neurolens/runtime/demo-security.mjs';

const env = process.env;
const security = loadDemoSecurityConfig(env);
const provider = loadAgentProviderConfig(env);

function present(name) {
  const value = env[name];
  return typeof value === 'string' && value.length > 0;
}

function classify() {
  const rows = [];
  const add = (id, status, detail) => rows.push({ id, status, detail });
  add('git_sha', 'NOT_VERIFIED', 'Fill from `git rev-parse HEAD` at deploy time.');
  add('target_environment', env.NEUROLENS_DEMO_DEPLOYMENT === 'preview' ? 'PASS' : 'BLOCKED', 'Preview must set NEUROLENS_DEMO_DEPLOYMENT=preview.');
  add('worker_name', 'NOT_VERIFIED', 'Sites generates dist/server/wrangler.json; no checked-in Worker name.');
  add('d1_binding', 'PASS', 'Declared binding name is DB in .openai/hosting.json.');
  add('d1_identity', env.NEUROLENS_DEMO_D1_ISOLATED === '1' ? 'NOT_VERIFIED' : 'BLOCKED', 'Isolated preview D1 must be created and bound by a human. Not created by this script.');
  add('required_secret_names', ['NEUROLENS_DEMO_PASSWORD', 'NEUROLENS_DEMO_SESSION_SECRET', 'NEUROLENS_DEMO_RATE_SECRET'].every(present) ? 'PASS' : 'BLOCKED', 'Names present in this process: password/session/rate secrets.');
  add('migrations', 'PASS', 'No new tables. Reuse drizzle/0000_cool_groot.sql upload_limits locally only.');
  add('mock_only', provider.kind === 'mock' && provider.allow_live !== true ? 'PASS' : 'FAIL', `provider=${provider.kind}; allow_live=${provider.allow_live === true}`);
  add('authentication', security.auth_required && security.ok ? 'PASS' : (security.ok ? 'FAIL' : 'BLOCKED'), security.error ?? 'auth_required');
  add('rate_limit', security.rate_limit_enabled ? 'PASS' : 'FAIL', `window_ms=${security.window_ms}; cap=${security.cap}`);
  add('cloud_authorization', 'BLOCKED', 'No explicit user approval to create D1, set secrets, or deploy.');
  return rows;
}

const rows = classify();
const blocking = rows.filter((row) => row.status === 'FAIL' || row.status === 'BLOCKED');
console.log(JSON.stringify({
  event: 'preview_readiness',
  deployment: security.deployment,
  provider_kind: provider.kind,
  allow_live: provider.allow_live === true,
  secret_names_present: {
    NEUROLENS_DEMO_PASSWORD: present('NEUROLENS_DEMO_PASSWORD'),
    NEUROLENS_DEMO_SESSION_SECRET: present('NEUROLENS_DEMO_SESSION_SECRET'),
    NEUROLENS_DEMO_RATE_SECRET: present('NEUROLENS_DEMO_RATE_SECRET'),
    OPENAI_API_KEY: present('OPENAI_API_KEY'),
  },
  rows,
  deploy_allowed: blocking.length === 0,
}, null, 2));
process.exit(0);
