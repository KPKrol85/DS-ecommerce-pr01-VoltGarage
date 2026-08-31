module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  ignorePatterns: ['assets/images/_optimized/**', 'tools/image-optimizer/output/**', 'dist/**'],
  rules: {
    'no-undef': 'error',
    'no-unused-vars': 'error',
  },
  overrides: [
    {
      files: ['tools/**/*.mjs'],
      env: {
        node: true,
      },
    },
    {
      files: ['scripts/**/*.js'],
      env: {
        node: true,
      },
    },
  ],
};
