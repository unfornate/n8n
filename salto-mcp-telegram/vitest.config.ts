import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.spec.ts"],
    setupFiles: ["test/setup.ts"],
    restoreMocks: true
  }
});
