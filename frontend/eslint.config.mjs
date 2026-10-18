// Линтер (npm run lint): короткие файлы и функции, правила хуков React.
// Лимиты — договорённость команды: компонент ≤ 100 строк, любой файл ≤ 150.
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const lines = (max) => ["error", { max, skipBlankLines: true, skipComments: true }];

export default tseslint.config(
  { ignores: ["node_modules", ".next", "out", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "max-lines": lines(150),
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 12],
      "max-depth": ["error", 3],
      "max-params": ["error", 5],
    },
  },
  { files: ["**/*.tsx"], rules: { "max-lines": lines(100) } },
  { files: ["tests/**"], rules: { "max-lines-per-function": "off" } },
);
