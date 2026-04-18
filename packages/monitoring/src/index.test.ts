import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureMessage,
  configureMonitoringFromEnv,
  createAxiomMonitoringSink,
  flushMonitoring,
  setMonitoringSink,
  type MonitoringSink,
} from './index';

const noopSink: MonitoringSink = {
  captureException: () => undefined,
  captureMessage: () => undefined,
};

afterEach(() => {
  setMonitoringSink(null);
});

describe('configureMonitoringFromEnv', () => {
  it('uses the default sink when Axiom env vars are missing', () => {
    expect(configureMonitoringFromEnv({ service: 'worker', env: {} })).toBe('default');
  });

  it('configures the Axiom sink when token and dataset are present', () => {
    expect(
      configureMonitoringFromEnv({
        service: 'worker',
        env: {
          AXIOM_TOKEN: 'token',
          AXIOM_DATASET: 'menukaze-logs',
          NODE_ENV: 'test',
        },
      }),
    ).toBe('axiom');
  });
});

describe('createAxiomMonitoringSink', () => {
  it('sends structured events to Axiom and can flush pending delivery', async () => {
    const requests: { url: string; body: string; authorization: string | undefined }[] = [];
    const fetchImpl = vi.fn(
      async (url: string, init: { headers: Record<string, string>; body: string }) => {
        requests.push({
          url,
          body: init.body,
          authorization: init.headers['Authorization'],
        });
        return {
          ok: true,
          status: 202,
          text: async () => '',
        };
      },
    );

    setMonitoringSink(
      createAxiomMonitoringSink({
        token: 'token',
        dataset: 'menukaze-logs',
        domain: 'https://api.axiom.co/',
        service: 'worker',
        environment: 'test',
        fetchImpl,
        fallbackSink: noopSink,
      }),
    );

    captureMessage('worker ready', 'info', { surface: 'worker' });
    await flushMonitoring();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.axiom.co/v1/ingest/menukaze-logs');
    expect(requests[0]?.authorization).toBe('Bearer token');
    expect(JSON.parse(requests[0]?.body ?? '[]')).toMatchObject([
      {
        source: 'menukaze',
        service: 'worker',
        environment: 'test',
        level: 'info',
        kind: 'message',
        message: 'worker ready',
        surface: 'worker',
      },
    ]);
  });
});
