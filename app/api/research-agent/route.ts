import { handleResearchAgentGet, handleResearchAgentPost } from '../../../lib/research-agent.mjs';
import { createDemoRequestOptions } from '../../../lib/research-agent-security.mjs';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return handleResearchAgentGet({ ...createDemoRequestOptions(), request });
}

export function POST(request: Request) {
  return handleResearchAgentPost(request, createDemoRequestOptions());
}
