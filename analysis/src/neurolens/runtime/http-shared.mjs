/**
 * Shared HTTP helpers for the Research Agent demo. Safe to import from
 * auth and request handlers without a cycle.
 */
import { DEMO_DISCLAIMER } from './demo-ui.mjs';

export const AGENT_API_VERSION = 'research-agent-http/0.1';

export const AGENT_HTTP_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function agentJson(status, body, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: { ...AGENT_HTTP_HEADERS, ...extraHeaders },
  });
}

export function agentErrorBody(error, extras = {}) {
  return {
    ok: false,
    api_version: AGENT_API_VERSION,
    error,
    demo: DEMO_DISCLAIMER,
    ...extras,
  };
}
