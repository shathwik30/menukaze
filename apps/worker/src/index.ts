import type { Server } from 'node:http';
import { closeAllConnections } from '@menukaze/db';
import { env } from './env';
import { startHealthServer, type WorkerHealthState } from './health-server';
import { sweepTimedOutSessions } from './session-sweeper';
import { drainWebhookOutbox } from './webhook-drainer';

const healthState: WorkerHealthState = {
  startedAt: new Date(),
  lastSweepAt: null,
  lastWebhookDrainAt: null,
  lastSweepResult: null,
  lastWebhookDrainResult: null,
};

const sweepIntervalMs = env.WORKER_SESSION_SWEEP_INTERVAL_MS;
const webhookIntervalMs = env.WORKER_WEBHOOK_INTERVAL_MS;
const healthPort = env.WORKER_HEALTH_PORT;
let shuttingDown = false;
let sweepInFlight = false;
let webhookInFlight = false;
let timer: NodeJS.Timeout | null = null;
let webhookTimer: NodeJS.Timeout | null = null;
let healthServer: Server | null = null;

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
    healthState.lastSweepAt = new Date();
    healthState.lastSweepResult = result;
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
    healthState.lastWebhookDrainAt = new Date();
    healthState.lastWebhookDrainResult = result;
    if (result.scanned > 0) {
      log('webhook outbox drained', { ...result });
    }
  } catch (error) {
    log('webhook drain failed', { error: errorMessage(error) });
  } finally {
    webhookInFlight = false;
  }
}

async function closeHealthServer(): Promise<void> {
  if (!healthServer) return;
  const server = healthServer;
  healthServer = null;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (timer) clearInterval(timer);
  if (webhookTimer) clearInterval(webhookTimer);
  await closeHealthServer();
  await closeAllConnections().catch((error: unknown) => {
    log('worker connection shutdown failed', { error: errorMessage(error) });
  });
  log('shutdown received', {
    signal,
    uptimeMs: Date.now() - healthState.startedAt.getTime(),
  });
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

log('worker ready', {
  pid: process.pid,
  node: process.version,
  env: env.NODE_ENV,
  sweepIntervalMs,
  webhookIntervalMs,
  healthPort,
});

healthServer = startHealthServer(healthPort, healthState);

void runSweep();
timer = setInterval(() => {
  void runSweep();
}, sweepIntervalMs);

void runWebhookDrain();
webhookTimer = setInterval(() => {
  void runWebhookDrain();
}, webhookIntervalMs);
