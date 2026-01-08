import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "node:async_hooks": "src/shims/async_hooks.js",
    },
  },
});
