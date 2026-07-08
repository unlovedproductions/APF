import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    pool: "threads",
    minWorkers: 1,
    maxWorkers: 1,
    fileParallelism: false,
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "server/**/*.test.mjs",
      "server/**/*.spec.mjs",
    ],
  },
});
