

module.exports = {
  root: true,
  extends: '@adobe/helix',
  overrides: [
    {
      files: ['*.test.js'],
      rules: {
        'no-unused-expressions': 'off',
      },
    },
  ],
};
