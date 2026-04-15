import { closeAllConnections } from '@menukaze/db';
import { sweepTimedOutSessions } from './session-sweeper';
import { drainWebhookOutbox } from './webhook-drainer';

const startedAt = new Date();
const sweepIntervalMs = Number.parseInt(
  process.env['WORKER_SESSION_SWEEP_INTERVAL_MS'] ?? '60000',
  10,
);
const webhookIntervalMs = Number.parseInt(process.env['WORKER_WEBHOOK_INTERVAL_MS'] ?? '5000', 10);
let shuttingDown = false;
let sweepInFlight = false;
let webhookInFlight = false;
let timer: NodeJS.Timeout | null = null;
let webhookTimer: NodeJS.Timeout | null = null;

function log(message: string, extra?: Record<string, unknown>): void {
  const entry = {
    level: 'info',
    time: new Date().toISOString(),
    service: 'worker',
    message,
    ...(extra ?? {}),
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runSweep(): Promise<void> {
  if (shuttingDown || sweepInFlight) return;
  sweepInFlight = true;
  try {
    const result = await sweepTimedOutSessions();
    if (result.expired > 0) {
      log('timed out sessions swept', { scanned: result.scanned, expired: result.expired });
    }
  } catch (error) {
    log('timed out session sweep failed', { error: errorMessage(error) });
  } finally {
    sweepInFlight = false;
  }
}

async function runWebhookDrain(): Promise<void> {
  if (shuttingDown || webhookInFlight) return;
  webhookInFlight = true;
  try {
    const result = await drainWebhookOutbox();
    if (result.scanned > 0) {
      log('webhook outbox drained', { ...result });
    }
  } catch (error) {
    log('webhook drain failed', { error: errorMessage(error) });
  } finally {
    webhookInFlight = false;
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (timer) clearInterval(timer);
  if (webhookTimer) clearInterval(webhookTimer);
  await closeAllConnections().catch((error: unknown) => {
    log('worker connection shutdown failed', { error: errorMessage(error) });
  });
  log('shutdown received', { signal, uptimeMs: Date.now() - startedAt.getTime() });
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

log('worker ready', {
  pid: process.pid,
  node: process.version,
  env: process.env['NODE_ENV'] ?? 'development',
  sweepIntervalMs,
  webhookIntervalMs,
});

void runSweep();
timer = setInterval(() => {
  void runSweep();
}, sweepIntervalMs);

void runWebhookDrain();
webhookTimer = setInterval(() => {
  void runWebhookDrain();
}, webhookIntervalMs);
