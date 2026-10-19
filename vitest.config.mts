import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@data": path.resolve(import.meta.dirname, "data"),
    },
  },
  test: { testTimeout: 60_000, include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
});
