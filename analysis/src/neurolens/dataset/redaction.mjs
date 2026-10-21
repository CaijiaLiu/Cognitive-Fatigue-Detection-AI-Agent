/**
 * Strip notes, user-agent, tokens, and other non-research identity fields
 * from dataset projections. participant_ref is retained as a browser alias.
 */
import { cloneJson } from '../agent/artifacts.mjs';
import { PRIVACY_DROPPED_KEYS, stableStringify } from './contracts.mjs';

export function stripPrivacyFields(record) {
  if (record === null || typeof record !== 'object') return record;
  const copy = cloneJson(record);
  stripInPlace(copy);
  return copy;
}

function stripInPlace(value) {
  if (Array.isArray(value)) {
    for (const item of value) stripInPlace(item);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const key of PRIVACY_DROPPED_KEYS) {
    delete value[key];
  }
  if (Object.hasOwn(value, 'environment')) delete value.environment;
  for (const nested of Object.values(value)) stripInPlace(nested);
}

export function datasetPrivacyLeaks(dataset, secrets) {
  const text = stableStringify(dataset);
  return secrets.filter((secret) => typeof secret === 'string' && secret.length > 0 && text.includes(secret));
}
