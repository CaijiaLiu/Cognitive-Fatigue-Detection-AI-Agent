import {
  handleDemoSessionDelete,
  handleDemoSessionGet,
  handleDemoSessionPost,
} from '../../../../lib/research-agent.mjs';
import { createDemoRequestOptions } from '../../../../lib/research-agent-security.mjs';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return handleDemoSessionGet(request, createDemoRequestOptions());
}

export function POST(request: Request) {
  return handleDemoSessionPost(request, createDemoRequestOptions());
}

export function DELETE(request: Request) {
  return handleDemoSessionDelete(request, createDemoRequestOptions());
}
