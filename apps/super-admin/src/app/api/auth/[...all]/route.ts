import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth';

/**
 * BetterAuth catch-all handler at /api/auth/*. Lazily initialised on first
 * request to avoid opening a Mongo connection at module load time.
 */
export const runtime = 'nodejs';

let cachedHandlers: ReturnType<typeof toNextJsHandler> | null = null;

async function handlers() {
  if (!cachedHandlers) {
    const auth = await getAuth();
    cachedHandlers = toNextJsHandler(auth);
  }
  return cachedHandlers;
}

export async function GET(request: Request): Promise<Response> {
  return (await handlers()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return (await handlers()).POST(request);
}
