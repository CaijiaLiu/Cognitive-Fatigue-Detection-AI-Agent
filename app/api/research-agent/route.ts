import { handleResearchAgentGet, handleResearchAgentPost } from '../../../lib/research-agent.mjs';

export const dynamic = 'force-dynamic';

export function GET() {
  return handleResearchAgentGet();
}

export function POST(request: Request) {
  return handleResearchAgentPost(request);
}
