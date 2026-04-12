import { NextResponse, type NextRequest } from 'next/server';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { channels } from '@menukaze/realtime';
import { createAblyTokenRequest } from '@menukaze/realtime/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const sessionObjectId = sessionId ? parseObjectId(sessionId) : null;
  if (!sessionId || !sessionObjectId) {
    return NextResponse.json({ error: 'Unknown session.' }, { status: 400 });
  }

  const conn = await getMongoConnection('live');
  const { TableSession } = getModels(conn);
  const session = await TableSession.findOne({ _id: sessionObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  const channel = channels.customerSession(String(session.restaurantId), sessionId);
  const tokenRequest = await createAblyTokenRequest({ [channel]: ['subscribe'] });
  return NextResponse.json(tokenRequest);
}
