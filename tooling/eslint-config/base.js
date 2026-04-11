import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';

/** Shared base ESLint flat config for Menukaze packages. */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2024 },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: {
      unicorn,
      boundaries,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // Unicorn — sanity rules
      'unicorn/filename-case': ['error', { case: 'kebabCase', ignore: ['README.md'] }],
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/prefer-module': 'off',

      // Monorepo import boundaries — enforced via the `boundaries` plugin in per-pkg configs
      // The default base does not enforce element types; packages opt in via their own config.
    },
  },
  {
    // Relax rules for config files, scripts, and tests
    files: ['**/*.config.{js,ts,mjs,cjs}', 'scripts/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'unicorn/filename-case': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
