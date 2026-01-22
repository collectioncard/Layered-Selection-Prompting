import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // Listen on all addresses
    port: 5173,
  },
  resolve: {
    alias: {
      "node:async_hooks": "src/shims/async_hooks.js",
    },
  },
});
