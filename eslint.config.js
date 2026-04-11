/**
 * Root ESLint config — currently a no-op ignore-all until packages and apps land.
 * Per-package lint rules live inside each package's own eslint.config.js,
 * which imports from @menukaze/eslint-config.
 */
export default [
  {
    ignores: ['**/*'],
  },
];
