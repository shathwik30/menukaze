import base from './tooling/eslint-config/base.js';

/**
 * Root ESLint config.
 *
 * We lint from the repo root so `pnpm lint` is a real gate instead of a
 * no-op. The shared base preset already carries the common ignore list and
 * TypeScript-aware rules; we add a few repo-specific ignores here.
 */
export default [
  ...base,
  {
    ignores: [
      '.code-review-graph/**',
      '.claude/**',
      '.github/**',
      '**/*.css',
      '**/*.json',
      '**/*.md',
      '**/*.yaml',
      '**/*.yml',
      '**/*.config.{js,ts,mjs,cjs}',
      '**/next.config.ts',
      '**/postcss.config.mjs',
      '**/vitest.config.ts',
      '**/e2e/**',
      'packages/db/scripts/**',
      'scripts/smoke.js',
      'tooling/**',
      '.prettierrc.cjs',
      'eslint.config.js',
    ],
  },
];
