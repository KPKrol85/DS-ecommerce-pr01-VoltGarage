module.exports = {
  extends: ['stylelint-config-recommended'],
  ignoreFiles: ['assets/images/_optimized/**', 'tools/image-optimizer/output/**'],
  rules: {
    'block-no-empty': true,
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-values'] },
    ],
    'no-descending-specificity': null,
  },
};
