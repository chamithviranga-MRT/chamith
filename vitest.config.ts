import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@config": path.resolve(__dirname, "config"),
      "@data": path.resolve(__dirname, "data"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});
