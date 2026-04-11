import base from './base.js';

/**
 * ESLint config for Next.js 15 apps.
 * Extends base + Next.js recommended rules.
 *
 * Note: eslint-config-next is a legacy CommonJS config; we adapt it into the flat config below.
 */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // These are the Next.js rules we care about in flat-config land.
      // The full eslint-config-next pack is pulled in per-app if needed via FlatCompat.
      'react/no-unescaped-entities': 'off',
    },
  },
];
