/**
 * Minimal LLM provider interface. Automated tests use the mock only.
 * A later real provider must implement the same complete() contract and
 * must not perform evidence validation.
 */
import { REASON_CODES } from '../agent/constants.mjs';
import { DEFAULT_MODEL, DEFAULT_PROVIDER_ID } from './constants.mjs';

export class ProviderError extends Error {
  constructor(reason_code, message) {
    super(message);
    this.name = 'ProviderError';
    this.reason_code = reason_code;
    this.failure_class = 'provider';
  }
}

export function providerIdentity(options = {}) {
  return {
    provider_id: options.provider_id ?? DEFAULT_PROVIDER_ID,
    model: options.model ?? DEFAULT_MODEL,
  };
}

function assertCompleteRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new ProviderError(REASON_CODES.REJECTED_REQUEST, 'Provider request must be an object.');
  }
  if (typeof request.system !== 'string' || typeof request.user !== 'string') {
    throw new ProviderError(REASON_CODES.REJECTED_REQUEST, 'Provider request requires system and user strings.');
  }
}

/**
 * Deterministic offline provider. Never reads env keys or calls the network.
 * `mode`: 'scripted' | 'timeout' | 'unavailable'
 * `response`: string | object | ({ system, user, timeout_ms }) => string|object
 */
export function createMockProvider(options = {}) {
  const identity = providerIdentity(options);
  const mode = options.mode ?? 'scripted';
  let completeCount = 0;

  return Object.freeze({
    ...identity,
    kind: 'mock',
    async complete(request = {}) {
      completeCount += 1;
      assertCompleteRequest(request);
      if (mode === 'timeout') {
        throw new ProviderError(REASON_CODES.PROVIDER_TIMEOUT, `Mock provider timed out after ${request.timeout_ms ?? 'unspecified'} ms.`);
      }
      if (mode === 'unavailable') {
        throw new ProviderError(REASON_CODES.PROVIDER_UNAVAILABLE, 'Mock provider is unavailable.');
      }
      if (options.response === undefined) {
        throw new ProviderError(REASON_CODES.PROVIDER_UNAVAILABLE, 'Mock provider has no scripted response.');
      }
      const raw = typeof options.response === 'function'
        ? options.response({
          system: request.system,
          user: request.user,
          timeout_ms: request.timeout_ms,
        })
        : options.response;
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      return Object.freeze({
        ...identity,
        text,
        latency_ms: options.latency_ms ?? 0,
      });
    },
    completeCount() {
      return completeCount;
    },
  });
}
