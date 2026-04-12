import { defineConfig, devices } from '@playwright/test';

export function createPlaywrightConfig({ command, port, testDir = './e2e', extraHTTPHeaders }) {
  return defineConfig({
    testDir,
    fullyParallel: true,
    forbidOnly: Boolean(process.env['CI']),
    retries: process.env['CI'] ? 2 : 0,
    reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
    use: {
      baseURL: `http://127.0.0.1:${String(port)}`,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
    },
    webServer: {
      command,
      port,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    projects: [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
    ],
  });
}
