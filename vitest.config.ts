import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const r = (p: string) => path.resolve(import.meta.dirname, p);

// Tests import the workspace packages from source, so `npm test` needs no build.
const alias = {
  "@orbis/shared": r("packages/shared/src/index.ts"),
  "@orbis/hub": r("packages/hub/src/index.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { extends: true, test: { name: "shared", include: ["packages/shared/test/**/*.test.ts"], environment: "node" } },
      {
        extends: true,
        test: {
          name: "hub",
          include: ["packages/hub/test/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          globalSetup: ["tests/setup/build-hub.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "cli",
          include: ["packages/cli/test/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          globalSetup: ["tests/setup/build-hub.ts"],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "web",
          include: ["packages/web/test/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["packages/web/test/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          environment: "node",
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
