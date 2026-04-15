import { createHmac, randomBytes } from 'node:crypto';
import {
  getMongoConnection,
  getModels,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MS,
} from '@menukaze/db';

/**
 * Drain pending webhook deliveries due to fire. Each call processes up to
 * `batchSize` rows, posts the signed payload to the subscription URL, and
 * either marks `delivered`, schedules the next retry, or marks `failed`
 * after the retry budget is exhausted.
 */

interface DrainResult {
  scanned: number;
  delivered: number;
  retried: number;
  failed: number;
}

const SIGNATURE_HEADER = 'X-Menukaze-Signature';
const ID_HEADER = 'X-Menukaze-Webhook-Id';
const TIMESTAMP_HEADER = 'X-Menukaze-Timestamp';
const REQUEST_TIMEOUT_MS = 30_000;
const FALLBACK_RETRY_DELAY_MS = 60_000;

function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Look up the delay for the next retry attempt. Falls back to the longest
 * configured delay (or `FALLBACK_RETRY_DELAY_MS` if the schedule is empty)
 * so we never throw or schedule a `NaN` retry.
 */
function nextRetryDelayMs(currentAttempts: number): number {
  return (
    WEBHOOK_RETRY_DELAYS_MS[currentAttempts] ??
    WEBHOOK_RETRY_DELAYS_MS[WEBHOOK_RETRY_DELAYS_MS.length - 1] ??
    FALLBACK_RETRY_DELAY_MS
  );
}

export async function drainWebhookOutbox(batchSize = 25): Promise<DrainResult> {
  const conn = await getMongoConnection('live');
  const { WebhookDelivery, WebhookSubscription } = getModels(conn);

  const now = new Date();
  const due = await WebhookDelivery.find(
    { status: 'pending', nextAttemptAt: { $lte: now } },
    null,
    { skipTenantGuard: true },
  )
    .sort({ nextAttemptAt: 1 })
    .limit(batchSize)
    .exec();

  let delivered = 0;
  let retried = 0;
  let failed = 0;

  for (const item of due) {
    const subscription = await WebhookSubscription.findOne(
      { _id: item.subscriptionId, restaurantId: item.restaurantId },
      null,
      { skipTenantGuard: true },
    ).exec();
    if (!subscription || !subscription.enabled) {
      item.status = 'failed';
      item.failedAt = new Date();
      item.lastError = 'subscription_disabled_or_missing';
      await item.save();
      failed += 1;
      continue;
    }

    const body = JSON.stringify(item.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(subscription.secret, timestamp, body);
    const idempotencyId = `${item.eventId}:${item.attempts + 1}`;
    item.attempts += 1;

    let response: Response | null = null;
    let responseBody = '';
    let networkError: string | null = null;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SIGNATURE_HEADER]: `v1=${signature}`,
          [ID_HEADER]: idempotencyId,
          [TIMESTAMP_HEADER]: timestamp,
          'User-Agent': `Menukaze-Webhook/1.0 (+${randomBytes(4).toString('hex')})`,
        },
        body,
        signal: controller.signal,
        redirect: 'manual',
      });
      try {
        responseBody = (await response.text()).slice(0, 4000);
      } catch {
        responseBody = '';
      }
    } catch (err) {
      networkError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (response && response.status >= 200 && response.status < 300) {
      item.status = 'delivered';
      item.deliveredAt = new Date();
      item.lastResponseStatus = response.status;
      item.lastResponseBody = responseBody;
      item.lastError = undefined;
      delivered += 1;
    } else {
      if (response) {
        item.lastResponseStatus = response.status;
        item.lastResponseBody = responseBody;
      }
      if (networkError) item.lastError = networkError;

      if (item.attempts >= WEBHOOK_MAX_ATTEMPTS) {
        item.status = 'failed';
        item.failedAt = new Date();
        failed += 1;
      } else {
        const nextDelay = nextRetryDelayMs(item.attempts);
        item.nextAttemptAt = new Date(Date.now() + nextDelay);
        retried += 1;
      }
    }

    await item.save();
  }

  return { scanned: due.length, delivered, retried, failed };
}
