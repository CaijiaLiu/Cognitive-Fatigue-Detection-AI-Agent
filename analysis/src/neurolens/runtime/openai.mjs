/**
 * Isolated OpenAI Chat Completions adapter.
 * Implements W2.1 complete(). Does not retrieve evidence or validate answers.
 */
import { REASON_CODES } from '../agent/constants.mjs';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_TIMEOUT_MS,
  OPENAI_CHAT_URL,
} from './constants.mjs';
import { ProviderError } from './provider.mjs';

function assertCompleteRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new ProviderError(REASON_CODES.REJECTED_REQUEST, 'Provider request must be an object.');
  }
  if (typeof request.system !== 'string' || typeof request.user !== 'string') {
    throw new ProviderError(REASON_CODES.REJECTED_REQUEST, 'Provider request requires system and user strings.');
  }
}

function safeStatusMessage(status) {
  if (status === 401 || status === 403) return 'OpenAI rejected the configured credentials.';
  if (status === 429) return 'OpenAI rate-limited the request.';
  if (status >= 500) return 'OpenAI is unavailable.';
  return 'OpenAI request failed.';
}

function readUsage(payload) {
  const usage = payload?.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const input_tokens = Number(usage.prompt_tokens);
  const output_tokens = Number(usage.completion_tokens);
  if (!Number.isFinite(input_tokens) && !Number.isFinite(output_tokens)) return undefined;
  return {
    input_tokens: Number.isFinite(input_tokens) ? input_tokens : 0,
    output_tokens: Number.isFinite(output_tokens) ? output_tokens : 0,
  };
}

export function createOpenAIProvider({
  apiKey,
  model = DEFAULT_OPENAI_MODEL,
  timeout_ms = DEFAULT_OPENAI_TIMEOUT_MS,
  max_output_tokens = DEFAULT_MAX_OUTPUT_TOKENS,
  fetchImpl = globalThis.fetch,
  endpoint = OPENAI_CHAT_URL,
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new ProviderError(REASON_CODES.PROVIDER_UNAVAILABLE, 'Real provider is selected but OPENAI_API_KEY is not configured.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new ProviderError(REASON_CODES.PROVIDER_UNAVAILABLE, 'Fetch is not available for the OpenAI provider.');
  }
  const identity = { provider_id: 'openai', model };
  let completeCount = 0;

  return Object.freeze({
    ...identity,
    kind: 'openai',
    timeout_ms,
    max_output_tokens,
    async complete(request = {}) {
      completeCount += 1;
      assertCompleteRequest(request);
      const started = Date.now();
      const limit = request.timeout_ms ?? timeout_ms;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), limit);
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: max_output_tokens,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new ProviderError(REASON_CODES.PROVIDER_TIMEOUT, `OpenAI request timed out after ${limit} ms.`);
        }
        throw new ProviderError(REASON_CODES.PROVIDER_UNAVAILABLE, 'OpenAI request could not be completed.');
      } finally {
        clearTimeout(timer);
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new ProviderError(REASON_CODES.PROVIDER_UNAVAILABLE, 'OpenAI returned a non-JSON envelope.');
      }
      if (!response.ok) {
        throw new ProviderError(REASON_CODES.PROVIDER_UNAVAILABLE, safeStatusMessage(response.status));
      }
      const text = payload?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new ProviderError(REASON_CODES.PROVIDER_UNAVAILABLE, 'OpenAI returned an empty response.');
      }
      return Object.freeze({
        ...identity,
        text,
        latency_ms: Math.max(0, Date.now() - started),
        usage: readUsage(payload),
        finish_reason: payload?.choices?.[0]?.finish_reason,
      });
    },
    completeCount() {
      return completeCount;
    },
  });
}
