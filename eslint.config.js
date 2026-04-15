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
      'packages/db/scripts/**',
      'tooling/**',
      '.prettierrc.cjs',
      'eslint.config.js',
    ],
  },
];
