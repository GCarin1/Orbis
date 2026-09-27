import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const hub = process.env.ORBIS_URL ?? "http://127.0.0.1:7420";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@orbis/shared": path.resolve(import.meta.dirname, "../shared/src/index.ts") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: hub, ws: true, changeOrigin: true },
      "/v1": { target: hub, changeOrigin: true },
      "/mcp": { target: hub, changeOrigin: true },
      "/hooks": { target: hub, changeOrigin: true },
      "/health": { target: hub, changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
});
