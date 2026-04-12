import { createNodeVitestConfig } from '@menukaze/vitest-config/node';

export default createNodeVitestConfig({
  test: {
    // mongodb-memory-server downloads/extracts a Mongo binary on first run.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
