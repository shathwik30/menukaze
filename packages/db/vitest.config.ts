import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // mongodb-memory-server downloads/extracts a Mongo binary on first run.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
