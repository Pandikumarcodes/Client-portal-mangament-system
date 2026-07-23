import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: globals.vitest,
    },
  },
];
