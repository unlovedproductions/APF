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
    env: {
      DATABASE_URL: "mysql://root:root@127.0.0.1:3306/apf_test",
      JWT_SECRET: "test-secret",
    },
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
