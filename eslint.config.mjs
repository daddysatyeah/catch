import tseslint from 'typescript-eslint'

export default [
  { ignores: ['node_modules/**', 'dist/**', '.catch-cache/**', 'release/**', 'test-results/**', 'playwright-report/**'] },
  { files: ['**/*.{js,mjs,cjs}'], rules: { 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-constant-binary-expression': 'error' } },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
]
