import base from './base.js';
import globals from 'globals';

/** ESLint config for Node-only packages (worker, server-side packages). */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'unicorn/prefer-top-level-await': 'off',
    },
  },
];
