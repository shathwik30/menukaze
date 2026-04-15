/**
 * Thin facade over error reporting. Today the default sink writes structured
 * JSON entries to stderr/stdout; a follow-up swaps the implementation for
 * Sentry (or any other reporter) by calling {@link setMonitoringSink}.
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
}

const SOURCE = 'menukaze';

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

function writeLog(stream: NodeJS.WritableStream, payload: Record<string, unknown>): void {
  stream.write(
    `${JSON.stringify({ source: SOURCE, time: new Date().toISOString(), ...payload })}\n`,
  );
}

const defaultSink: MonitoringSink = {
  captureException(error, context) {
    writeLog(process.stderr, {
      level: 'error',
      kind: 'exception',
      error: sanitizeError(error),
      ...(context ?? {}),
    });
  },
  captureMessage(message, severity, context) {
    const stream = severity === 'error' ? process.stderr : process.stdout;
    writeLog(stream, {
      level: severity,
      kind: 'message',
      message,
      ...(context ?? {}),
    });
  },
};

let activeSink: MonitoringSink = defaultSink;

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
