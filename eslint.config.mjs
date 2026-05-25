import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**', 'third_party/**', 'src/renderer/namespaces/*.generated.ts']
  },
  {
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/triple-slash-reference': ['error', { path: 'always', types: 'prefer-import', lib: 'always' }],
      'preserve-caught-error': 'off',
      'import-x/extensions': ['error', 'ignorePackages', { js: 'always', ts: 'never' }]
    }
  }
);
