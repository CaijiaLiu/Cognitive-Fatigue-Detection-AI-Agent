import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeployPreflight } from '../analysis/src/neurolens/runtime/deploy-preflight.mjs';

test('offline deploy preflight passes local repository checks', () => {
  const report = evaluateDeployPreflight({ processEnv: {} });
  assert.equal(report.ok, true);
  assert.equal(report.deploy_allowed, false);
  const byId = Object.fromEntries(report.rows.map((row) => [row.id, row]));
  assert.equal(byId.preview_mode.status, 'PASS');
  assert.equal(byId.mock_provider.status, 'PASS');
  assert.equal(byId.live_provider_disabled.status, 'PASS');
  assert.equal(byId.authentication_enabled.status, 'PASS');
  assert.equal(byId.d1_isolation_acknowledgement.status, 'PASS');
  assert.equal(byId.preview_fail_closed.status, 'PASS');
  assert.equal(byId.worker_entrypoint.status, 'PASS');
  assert.equal(byId.binding_configuration.status, 'PASS');
  assert.equal(byId.no_production_deploy_script.status, 'PASS');
  assert.equal(byId.remote_d1_identity.status, 'NOT_VERIFIED');
  assert.equal(byId.sites_publication.status, 'NOT_VERIFIED');
  assert.doesNotMatch(JSON.stringify(report), /sk-/);
});

test('preflight fails closed when ALLOW_LIVE is set in the process', () => {
  const report = evaluateDeployPreflight({
    processEnv: { NEUROLENS_AGENT_ALLOW_LIVE: '1' },
  });
  assert.equal(report.ok, false);
  assert.equal(report.rows.find((row) => row.id === 'live_provider_disabled').status, 'FAIL');
});
