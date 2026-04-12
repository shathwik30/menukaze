import { defineConfig, mergeConfig } from 'vitest/config';

const nodeDefaults = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});

export function createNodeVitestConfig(overrides = {}) {
  return mergeConfig(nodeDefaults, defineConfig(overrides));
}

export default nodeDefaults;
