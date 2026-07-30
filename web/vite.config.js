import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about.html"),
        visualizations: resolve(import.meta.dirname, "visualizations.html"),
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
