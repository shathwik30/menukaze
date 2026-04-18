import { NextResponse } from 'next/server';
import { getMongoConnection } from '@menukaze/db';
import { captureException } from '@menukaze/monitoring';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SERVICE = 'dashboard';

// Liveness + readiness probe. Mongo is the only critical dependency; 503 if it's down.
export async function GET(): Promise<NextResponse> {
  const checks: { mongodb: 'ok' | 'error' } = { mongodb: 'ok' };
  let healthy = true;

  try {
    const conn = await getMongoConnection('live');
    if (conn.readyState !== 1) {
      healthy = false;
      checks.mongodb = 'error';
    }
  } catch (error) {
    healthy = false;
    checks.mongodb = 'error';
    captureException(error, { surface: `${SERVICE}:health`, message: 'mongodb check failed' });
  }

  return NextResponse.json(
    {
      ok: healthy,
      service: SERVICE,
      time: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}
