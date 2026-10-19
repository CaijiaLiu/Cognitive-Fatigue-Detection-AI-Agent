/**
 * Server-side Research Agent provider configuration.
 * The browser never selects provider_id or model. Secrets stay in this module.
 */
import { REASON_CODES } from '../agent/constants.mjs';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_TIMEOUT_MS,
  DEFAULT_PROVIDER_ID,
  DEFAULT_TIMEOUT_MS,
} from './constants.mjs';
import { ProviderError, createMockProvider } from './provider.mjs';
import { createOpenAIProvider } from './openai.mjs';

export const PROVIDER_KINDS = Object.freeze(['mock', 'openai']);
export {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_TIMEOUT_MS,
  OPENAI_CHAT_URL,
} from './constants.mjs';

const ENV = Object.freeze({
  PROVIDER: 'NEUROLENS_AGENT_PROVIDER',
  MODEL: 'NEUROLENS_AGENT_MODEL',
  TIMEOUT: 'NEUROLENS_AGENT_TIMEOUT_MS',
  MAX_TOKENS: 'NEUROLENS_AGENT_MAX_OUTPUT_TOKENS',
  API_KEY: 'OPENAI_API_KEY',
  ALLOW_LIVE: 'NEUROLENS_AGENT_ALLOW_LIVE',
  MAX_CASES: 'NEUROLENS_AGENT_MAX_CASES',
  MAX_REQUESTS: 'NEUROLENS_AGENT_MAX_REQUESTS',
  PRICE_INPUT: 'NEUROLENS_AGENT_PRICE_INPUT_PER_1K',
  PRICE_OUTPUT: 'NEUROLENS_AGENT_PRICE_OUTPUT_PER_1K',
  MAX_COST: 'NEUROLENS_AGENT_MAX_COST_USD',
});

export const AGENT_ENV = ENV;

function readInt(env, name, fallback, { min, max } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return { error: `${name} must be an integer.` };
  }
  if (min !== undefined && value < min) return { error: `${name} is below ${min}.` };
  if (max !== undefined && value > max) return { error: `${name} exceeds ${max}.` };
  return value;
}

function readNumber(env, name) {
  const raw = env[name];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return { error: `${name} must be a non-negative number.` };
  return value;
}

export function loadAgentProviderConfig(env = {}) {
  const kind = String(env[ENV.PROVIDER] ?? 'mock').trim().toLowerCase() || 'mock';
  const parsedTimeout = readInt(
    env,
    ENV.TIMEOUT,
    kind === 'openai' ? DEFAULT_OPENAI_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
    { min: 1, max: 120000 },
  );
  const parsedTokens = readInt(env, ENV.MAX_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS, { min: 16, max: 4096 });
  if (parsedTimeout?.error || parsedTokens?.error) {
    return {
      ok: false,
      kind,
      provider_id: kind,
      model: env[ENV.MODEL] || (kind === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_MODEL),
      api_key_present: false,
      error: parsedTimeout?.error ?? parsedTokens.error,
      reason_code: REASON_CODES.PROVIDER_UNAVAILABLE,
    };
  }
  const model = String(env[ENV.MODEL] ?? (kind === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_MODEL)).trim();
  const allow_live = env[ENV.ALLOW_LIVE] === '1' || env[ENV.ALLOW_LIVE] === 'true';
  const base = {
    kind,
    provider_id: kind === 'mock' ? DEFAULT_PROVIDER_ID : 'openai',
    model,
    timeout_ms: parsedTimeout,
    max_output_tokens: parsedTokens,
    allow_live,
    api_key_present: false,
  };

  if (!PROVIDER_KINDS.includes(kind)) {
    return {
      ...base,
      ok: false,
      error: 'NEUROLENS_AGENT_PROVIDER must be mock or openai.',
      reason_code: REASON_CODES.PROVIDER_UNAVAILABLE,
    };
  }
  if (kind === 'mock') {
    return { ...base, ok: true, provider_id: DEFAULT_PROVIDER_ID };
  }
  const apiKey = typeof env[ENV.API_KEY] === 'string' ? env[ENV.API_KEY].trim() : '';
  if (!apiKey) {
    return {
      ...base,
      ok: false,
      error: 'Real provider is selected but OPENAI_API_KEY is not configured.',
      reason_code: REASON_CODES.PROVIDER_UNAVAILABLE,
    };
  }
  return { ...base, ok: true, api_key: apiKey, api_key_present: true };
}

export function publicProviderView(config) {
  return {
    kind: config.kind ?? 'mock',
    provider_id: config.provider_id ?? DEFAULT_PROVIDER_ID,
    model: config.model ?? DEFAULT_MODEL,
    configured: config.ok === true,
    live: false,
  };
}

export function assertNoSecretLeak(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return true;
  if (/sk-[a-zA-Z0-9_-]{10,}/.test(text)) return false;
  if (/Bearer\s+sk-/i.test(text)) return false;
  return true;
}

export function loadEvalBudget(env = {}) {
  const max_cases = readInt(env, ENV.MAX_CASES, 32, { min: 1, max: 64 });
  const max_requests = readInt(env, ENV.MAX_REQUESTS, 32, { min: 0, max: 64 });
  const max_cost = readNumber(env, ENV.MAX_COST);
  const price_input = readNumber(env, ENV.PRICE_INPUT);
  const price_output = readNumber(env, ENV.PRICE_OUTPUT);
  for (const parsed of [max_cases, max_requests, max_cost, price_input, price_output]) {
    if (parsed?.error) {
      return { ok: false, error: parsed.error };
    }
  }
  const pricing_configured = Number.isFinite(price_input) && Number.isFinite(price_output);
  return {
    ok: true,
    max_cases,
    max_requests,
    max_cost_usd: Number.isFinite(max_cost) ? max_cost : null,
    price_input_per_1k: pricing_configured ? price_input : null,
    price_output_per_1k: pricing_configured ? price_output : null,
    pricing_configured,
  };
}

export function createConfiguredProvider(config, extras = {}) {
  if (!config?.ok) {
    throw new ProviderError(
      config?.reason_code ?? REASON_CODES.PROVIDER_UNAVAILABLE,
      config?.error ?? 'Research Agent provider is not configured.',
    );
  }
  if (config.kind === 'mock') {
    if (extras.provider) return extras.provider;
    return createMockProvider({
      provider_id: extras.provider_id ?? 'mock-demo',
      model: extras.model ?? 'mock-compose/0.1',
      response: extras.response,
      mode: extras.mode,
      latency_ms: extras.latency_ms,
    });
  }
  return createOpenAIProvider({
    apiKey: config.api_key,
    model: config.model,
    timeout_ms: extras.timeout_ms ?? config.timeout_ms,
    max_output_tokens: extras.max_output_tokens ?? config.max_output_tokens,
    fetchImpl: extras.fetchImpl,
  });
}
