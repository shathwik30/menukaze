import { toNextJsHandler } from 'better-auth/next-js';
import type { AuthInstance } from './config';

type GetAuth = () => Promise<AuthInstance>;

/**
 * Build Next.js route handlers for BetterAuth's catch-all endpoint at
 * /api/auth/[...all]. The endpoint mounts every BetterAuth route:
 *
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-in/email
 *   POST /api/auth/sign-out
 *   GET  /api/auth/session
 *   ...etc
 *
 * The handler is built lazily on the first request so we don't open a Mongo
 * connection at module load time.
 */
export function createBetterAuthRouteHandler(getAuth: GetAuth): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  let cached: ReturnType<typeof toNextJsHandler> | null = null;

  async function handlers() {
    if (!cached) {
      const auth = await getAuth();
      cached = toNextJsHandler(auth);
    }
    return cached;
  }

  return {
    async GET(request) {
      return (await handlers()).GET(request);
    },
    async POST(request) {
      return (await handlers()).POST(request);
    },
  };
}
