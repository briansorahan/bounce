import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/workflows/**/*.test.ts"],
    exclude: [
      "src/database-projects.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/native.d.ts",
      ],
      reporter: ["lcov", "text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
