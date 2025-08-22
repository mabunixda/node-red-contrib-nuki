const js = require("@eslint/js");

module.exports = [
  {
    ...js.configs.recommended,
    files: ["**/*.js"],
    ignores: ["node_modules/**", "**/node_modules/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // Add or override rules as needed
    },
  },
];
