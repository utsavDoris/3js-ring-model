import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      // Force webgi to resolve to the ESM bundle avoiding the directory issue in browser field
      webgi: "webgi/dist/examples/runtime/bundle.m.js",
    },
  },
  server: {
    fs: {
      // Allow serving files from one level up to the project root
      allow: [".."],
    },
  },
});
