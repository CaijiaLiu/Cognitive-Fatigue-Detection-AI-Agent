#!/usr/bin/env node
/**
 * Offline Sites preview preflight. Never prints secret values.
 * Does not create D1, set secrets, or publish.
 */
import { evaluateDeployPreflight, formatPreflight } from '../analysis/src/neurolens/runtime/deploy-preflight.mjs';

const report = evaluateDeployPreflight({ processEnv: process.env });
console.log(formatPreflight(report));
process.exit(report.ok ? 0 : 1);
