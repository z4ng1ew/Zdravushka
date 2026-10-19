// Автотесты (npm test): правила, разбор ответов сервера, хранилище и хуки. В сборку не попадают.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node", // тесты хуков и браузера включают jsdom сами: // @vitest-environment jsdom
    coverage: {
      include: ["shared/**", "features/**/*.ts"],
      exclude: ["shared/ui/**", "shared/domain/baseline.ts", "**/*.tsx"],
      reporter: ["text-summary", "text"],
    },
  },
});
