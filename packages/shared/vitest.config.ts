import { createNodeVitestConfig } from '@menukaze/vitest-config/node';

export default createNodeVitestConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
