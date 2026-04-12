import { createPlaywrightConfig } from '@menukaze/playwright-config';

export default createPlaywrightConfig({
  command:
    "bash -lc 'set -a; [ -f ../../.env.local ] && . ../../.env.local; set +a; exec corepack pnpm exec next dev --port 3101'",
  port: 3101,
  extraHTTPHeaders: {
    'x-tenant-kind': 'subdomain',
    'x-tenant-slug': 'demo',
  },
});
