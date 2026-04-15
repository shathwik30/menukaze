import { createBetterAuthRouteHandler } from '@menukaze/auth/next';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';

export const { GET, POST } = createBetterAuthRouteHandler(getAuth);
