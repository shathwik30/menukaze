import 'server-only';
import Ably from 'ably';
import type { RealtimeEvent } from './events';

/**
 * Server-only Ably entrypoints.
 *
 * `publishRealtimeEvent(channelName, event)` fans an event out over Ably on
 * the given channel. `createAblyTokenRequest(capability, clientId?)` issues
 * a short-lived token that the browser can use to subscribe without ever
 * seeing the root API key.
 */

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

/**
 * Mint a token request the browser can use to authenticate with Ably. The
 * `capability` argument is an Ably-style scope map: channel-name → permitted
 * operations. Customer tracking pages receive `{ '<channel>': ['subscribe'] }`.
 */
export async function createAblyTokenRequest(
  capability: AblyCapability,
  clientId?: string,
): Promise<Ably.TokenRequest> {
  const rest = getRest();
  return rest.auth.createTokenRequest({
    capability: JSON.stringify(capability),
    ...(clientId ? { clientId } : {}),
    ttl: 60 * 60 * 1000, // 1 hour
  });
}
