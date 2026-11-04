import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
export default defineConfig({
  root: "client",
  plugins: [svelte()],
  build: { outDir: "../dist/client", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
});
