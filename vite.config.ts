import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    passWithNoTests: true,
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
          include: ["tests/unit/**/*.{test,spec}.ts"],
        },
      },
      {
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/ui/**/*.{test,spec}.{ts,tsx}"],
        },
      },
    ],
  },
});
