// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'src/startpage.generated.ts'],
  },
  {
    rules: {
      // Animated values live in refs and are handed to styles while rendering
      // (useRef(new Animated.Value(0)).current); that's React Native's own pattern.
      'react-hooks/refs': 'off',
    },
  },
]);
