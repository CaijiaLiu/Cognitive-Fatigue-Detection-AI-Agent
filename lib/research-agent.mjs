/**
 * Server facade for the synthetic Research Agent demo API.
 * Does not import collection, D1, or Cloudflare env.
 */
export {
  AGENT_API_VERSION,
  ALLOWED_SESSION_REFS,
  createDemoRuntime,
  handleResearchAgentGet,
  handleResearchAgentPost,
} from '../analysis/src/neurolens/runtime/http.mjs';
