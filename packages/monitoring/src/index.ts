/**
 * Thin facade over error reporting. Today this logs to stderr/stdout; the
 * intent is that a follow-up swaps the implementations for Sentry (or any
 * other reporter) without touching every call site.
 *
 * Call-site contract: never pass a Response/Request/secret in `context`.
 * Only pass data safe to surface in the eventual error monitor.
 */

export type Severity = 'info' | 'warning' | 'error';

function hasContext(
  context: Record<string, unknown> | undefined,
): context is Record<string, unknown> {
  return context !== undefined && Object.keys(context).length > 0;
}

/**
 * Report a thrown exception. Pass additional context (trace ids, user hints,
 * etc.) via the second arg — it will appear on the Sentry event when that
 * integration lands.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  // TODO: replace with Sentry.captureException(error, { extra: context })
  // when @sentry/nextjs is installed.
  if (hasContext(context)) {
    console.error('[monitoring]', error, context);
  } else {
    console.error('[monitoring]', error);
  }
}

/**
 * Report a plain message (not an exception). Use for expected-but-notable
 * conditions like retry-exhaustion, fallback paths, or config warnings.
 */
export function captureMessage(
  message: string,
  severity: Severity = 'info',
  context?: Record<string, unknown>,
): void {
  // TODO: replace with Sentry.captureMessage(message, { level: severity, extra: context })
  const prefix = `[monitoring:${severity}]`;
  const logger =
    severity === 'error' ? console.error : severity === 'warning' ? console.warn : console.info;
  if (hasContext(context)) {
    logger(prefix, message, context);
  } else {
    logger(prefix, message);
  }
}
