import { createPlaywrightConfig } from '@menukaze/playwright-config';

export default createPlaywrightConfig({
  command:
    "bash -lc 'set -a; [ -f ../../.env.local ] && . ../../.env.local; set +a; exec corepack pnpm exec next dev --port 3103'",
  port: 3103,
  extraHTTPHeaders: {
    'x-tenant-slug': 'demo',
  },
});
