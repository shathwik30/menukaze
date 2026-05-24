import { createServer, type Server } from 'node:http';
import { getMongoConnection } from '@menukaze/db';
import { captureException } from '@menukaze/monitoring';

export interface WorkerHealthState {
  startedAt: Date;
  lastSweepAt: Date | null;
  lastWebhookDrainAt: Date | null;
  lastSweepResult: { scanned: number; expired: number } | null;
  lastWebhookDrainResult: {
    scanned: number;
    delivered: number;
    retried: number;
    failed: number;
  } | null;
}

interface HealthBody {
  ok: boolean;
  service: 'worker';
  time: string;
  uptimeMs: number;
  pid: number;
  checks: { mongodb: 'ok' | 'error' };
  jobs: {
    sessionSweep: {
      lastRunAt: string | null;
      lastResult: WorkerHealthState['lastSweepResult'];
    };
    webhookDrain: {
      lastRunAt: string | null;
      lastResult: WorkerHealthState['lastWebhookDrainResult'];
    };
  };
}

async function buildHealthBody(state: WorkerHealthState): Promise<{
  status: number;
  body: HealthBody;
}> {
  let mongoOk: boolean;
  try {
    const conn = await getMongoConnection('live');
    mongoOk = conn.readyState === 1;
  } catch (error) {
    mongoOk = false;
    captureException(error, { surface: 'worker:health', message: 'mongodb check failed' });
  }

  const body: HealthBody = {
    ok: mongoOk,
    service: 'worker',
    time: new Date().toISOString(),
    uptimeMs: Date.now() - state.startedAt.getTime(),
    pid: process.pid,
    checks: { mongodb: mongoOk ? 'ok' : 'error' },
    jobs: {
      sessionSweep: {
        lastRunAt: state.lastSweepAt?.toISOString() ?? null,
        lastResult: state.lastSweepResult,
      },
      webhookDrain: {
        lastRunAt: state.lastWebhookDrainAt?.toISOString() ?? null,
        lastResult: state.lastWebhookDrainResult,
      },
    },
  };
  return { status: mongoOk ? 200 : 503, body };
}

// Returns null when port === 0 (disabled for tests).
export function startHealthServer(port: number, state: WorkerHealthState): Server | null {
  if (port === 0) return null;

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    if (url !== '/health' && url !== '/health/') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    void buildHealthBody(state)
      .then(({ status, body }) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      })
      .catch((error: unknown) => {
        captureException(error, {
          surface: 'worker:health',
          message: 'health endpoint handler failed',
        });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
      });
  });

  server.on('error', (error) => {
    captureException(error, { surface: 'worker:health', message: 'health server error' });
  });
  server.listen(port);
  return server;
}
