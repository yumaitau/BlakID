import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/security/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "apps/**/.next/**", "tests/integration/**", "tests/e2e/**"],
    environment: "node",
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: true,
  },
});
