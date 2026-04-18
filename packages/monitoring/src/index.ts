/**
 * Thin facade over error reporting and production logs. The default sink writes
 * structured JSON entries locally. Server runtimes can install the built-in
 * Axiom HTTP sink with {@link configureMonitoringFromEnv}.
 *
 * Call-site contract: never pass a Response/Request/secret in `context`.
 * Only pass data safe to surface in the eventual error monitor.
 */

export type Severity = 'info' | 'warning' | 'error';

export interface MonitoringContext {
  /**
   * Logical surface that captured the event. Use `area:subarea` form so the
   * monitor can group by surface (e.g. `dashboard:orders`, `worker:webhooks`).
   */
  surface?: string;
  /** One-line free-form note from the call site. */
  message?: string;
  /** Anything else the monitor should attach (request id, tenant id, etc.). */
  [key: string]: unknown;
}

export interface MonitoringSink {
  captureException(error: unknown, context?: MonitoringContext): void;
  captureMessage(message: string, severity: Severity, context?: MonitoringContext): void;
  flush?(): Promise<void>;
}

const SOURCE = 'menukaze';
const DEFAULT_AXIOM_DOMAIN = 'https://api.axiom.co';

type MonitoringEnv = Record<string, string | undefined>;

export interface AxiomMonitoringSinkOptions {
  token: string;
  dataset: string;
  domain?: string;
  service: string;
  environment?: string;
  fetchImpl?: AxiomFetch;
  fallbackSink?: MonitoringSink;
}

export interface ConfigureMonitoringInput {
  service: string;
  environment?: string;
  env?: MonitoringEnv;
  fetchImpl?: AxiomFetch;
}

interface AxiomFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

type AxiomFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<AxiomFetchResponse>;

function sanitizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { value: error };
}

function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({
      source: SOURCE,
      time: new Date().toISOString(),
      level: 'error',
      kind: 'serialization_error',
      error: sanitizeError(error),
    });
  }
}

function writeLog(target: 'stdout' | 'stderr', payload: Record<string, unknown>): void {
  const line = `${serializeJson({ source: SOURCE, time: new Date().toISOString(), ...payload })}\n`;
  const stream =
    typeof process !== 'undefined' ? (target === 'stderr' ? process.stderr : process.stdout) : null;

  if (stream && typeof stream.write === 'function') {
    stream.write(line);
    return;
  }

  if (target === 'stderr') {
    console.error(line.trim());
    return;
  }
  console.log(line.trim());
}

const defaultSink: MonitoringSink = {
  captureException(error, context) {
    writeLog('stderr', {
      level: 'error',
      kind: 'exception',
      error: sanitizeError(error),
      ...(context ?? {}),
    });
  },
  captureMessage(message, severity, context) {
    writeLog(severity === 'error' ? 'stderr' : 'stdout', {
      level: severity,
      kind: 'message',
      message,
      ...(context ?? {}),
    });
  },
};

let activeSink: MonitoringSink = defaultSink;

function normalizeAxiomDomain(domain: string | undefined): string {
  const value = domain?.trim() ? domain.trim() : DEFAULT_AXIOM_DOMAIN;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

function defaultFetch(): AxiomFetch | null {
  if (typeof fetch !== 'function') return null;
  return (url, init) => fetch(url, init);
}

function createAxiomEvent(
  service: string,
  environment: string | undefined,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    source: SOURCE,
    service,
    time: new Date().toISOString(),
    ...(environment ? { environment } : {}),
    ...payload,
  };
}

export function createAxiomMonitoringSink(options: AxiomMonitoringSinkOptions): MonitoringSink {
  const endpoint = `${normalizeAxiomDomain(options.domain)}/v1/ingest/${encodeURIComponent(
    options.dataset,
  )}`;
  const fetcher = options.fetchImpl ?? defaultFetch();
  const fallbackSink = options.fallbackSink ?? defaultSink;
  const pending = new Set<Promise<void>>();

  function send(event: Record<string, unknown>): void {
    if (!fetcher) return;

    const task = fetcher(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
      body: serializeJson([event]),
    })
      .then(async (response) => {
        if (response.ok) return;
        const responseBody = await response.text().catch(() => '');
        defaultSink.captureMessage('Axiom ingest rejected monitoring event', 'warning', {
          surface: 'monitoring:axiom',
          status: response.status,
          response: responseBody.slice(0, 500),
        });
      })
      .catch((error: unknown) => {
        defaultSink.captureException(error, {
          surface: 'monitoring:axiom',
          message: 'failed to send monitoring event',
        });
      });

    pending.add(task);
    void task.finally(() => pending.delete(task));
  }

  return {
    captureException(error, context) {
      fallbackSink.captureException(error, context);
      send(
        createAxiomEvent(options.service, options.environment, {
          level: 'error',
          kind: 'exception',
          error: sanitizeError(error),
          ...(context ?? {}),
        }),
      );
    },
    captureMessage(message, severity, context) {
      fallbackSink.captureMessage(message, severity, context);
      send(
        createAxiomEvent(options.service, options.environment, {
          level: severity,
          kind: 'message',
          message,
          ...(context ?? {}),
        }),
      );
    },
    async flush() {
      await Promise.allSettled([...pending]);
    },
  };
}

function processEnv(): MonitoringEnv {
  return typeof process !== 'undefined' ? process.env : {};
}

export function configureMonitoringFromEnv(input: ConfigureMonitoringInput): 'axiom' | 'default' {
  const env = input.env ?? processEnv();
  const token = env['AXIOM_TOKEN'];
  const dataset = env['AXIOM_DATASET'];

  if (!token || !dataset) {
    setMonitoringSink(null);
    return 'default';
  }

  setMonitoringSink(
    createAxiomMonitoringSink({
      token,
      dataset,
      domain: env['AXIOM_DOMAIN'],
      service: input.service,
      environment: input.environment ?? env['VERCEL_ENV'] ?? env['NODE_ENV'],
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    }),
  );
  return 'axiom';
}

/**
 * Replace the active sink. Production wiring (e.g. `@sentry/nextjs`) installs
 * a sink that forwards to the external service. Tests can install a no-op
 * or capturing sink. Pass `null` to restore the default JSON-to-stderr sink.
 */
export function setMonitoringSink(sink: MonitoringSink | null): void {
  activeSink = sink ?? defaultSink;
}

/**
 * Report a thrown exception. Pass additional context (trace ids, user hints,
 * etc.) via the second arg — it will be forwarded to the active sink.
 */
export function captureException(error: unknown, context?: MonitoringContext): void {
  activeSink.captureException(error, context);
}

/**
 * Report a plain message (not an exception). Use for expected-but-notable
 * conditions like retry-exhaustion, fallback paths, or config warnings.
 */
export function captureMessage(
  message: string,
  severity: Severity = 'info',
  context?: MonitoringContext,
): void {
  activeSink.captureMessage(message, severity, context);
}

export async function flushMonitoring(): Promise<void> {
  await activeSink.flush?.();
}
