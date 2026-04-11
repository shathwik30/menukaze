/**
 * Menukaze worker — long-running Node service that drains the BullMQ outbox,
 * sends emails, generates receipts, runs cron jobs (billing month-end,
 * dunning, retention purge, reservation reminders, custom-domain verify).
 *
 * Phase 3: minimal scaffold that boots, logs ready, and exits cleanly on
 * SIGTERM. Phase 4 wires up the actual BullMQ queues + processors as the
 * dependent packages (jobs, webhooks, email) come online.
 */

const startedAt = new Date();

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

function shutdown(signal: NodeJS.Signals): void {
  log('shutdown received', { signal, uptimeMs: Date.now() - startedAt.getTime() });
  // Phase 4: gracefully drain BullMQ workers, close Mongo connections.
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

log('worker ready', {
  pid: process.pid,
  node: process.version,
  env: process.env['NODE_ENV'] ?? 'development',
});

// Keep the event loop alive. Phase 4 replaces this with the BullMQ worker
// run loop, which holds the loop open via the Redis connection.
setInterval(() => {
  // heartbeat — every 30s. Will be replaced by real queue processing.
}, 30_000);
