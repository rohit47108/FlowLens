import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.{ts,tsx}"],
      thresholds: {
        "src/domain/**": {
          statements: 90,
          lines: 90,
          functions: 90,
          branches: 85,
        },
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "src/**/*.spec.ts",
            "tests/unit/**/*.{test,spec}.ts",
            "tests/integration/**/*.{test,spec}.ts",
          ],
        },
      },
      {
        test: {
          name: "ui",
          environment: "jsdom",
          include: [
            "src/**/*.test.tsx",
            "src/**/*.spec.tsx",
            "tests/ui/**/*.{test,spec}.{ts,tsx}",
          ],
        },
      },
    ],
  },
});
