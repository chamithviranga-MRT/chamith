import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@config": path.resolve(import.meta.dirname, "config"),
      "@data": path.resolve(import.meta.dirname, "data"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});
