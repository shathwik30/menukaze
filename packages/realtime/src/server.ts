import Ably from 'ably';
import type { RealtimeEvent } from './events';

const ABLY_TOKEN_TTL_MS = 60 * 60 * 1000;

let cached: Ably.Rest | null = null;

function getRest(): Ably.Rest {
  if (cached) return cached;
  const key = process.env['ABLY_API_KEY'];
  if (!key) {
    throw new Error('Missing ABLY_API_KEY — set it in .env.local before publishing.');
  }
  cached = new Ably.Rest(key);
  return cached;
}

export async function publishRealtimeEvent(
  channelName: string,
  event: RealtimeEvent,
): Promise<void> {
  const rest = getRest();
  await rest.channels.get(channelName).publish(event.type, event);
}

export type AblyCapability = Record<
  string,
  Array<'publish' | 'subscribe' | 'presence' | 'history'>
>;

export async function createAblyTokenRequest(
  capability: AblyCapability,
  clientId?: string,
): Promise<Ably.TokenRequest> {
  const rest = getRest();
  return rest.auth.createTokenRequest({
    capability: JSON.stringify(capability),
    ...(clientId ? { clientId } : {}),
    ttl: ABLY_TOKEN_TTL_MS,
  });
}
