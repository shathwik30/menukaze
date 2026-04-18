import { toNextJsHandler } from 'better-auth/next-js';
import type { AuthInstance } from './config';

type GetAuth = () => Promise<AuthInstance>;

// Handlers are built lazily so Mongo isn't opened at module load time.
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
