import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "public/manifest.json",
      additionalInputs: ["src/feed/index.html", "src/auth/index.html"],
    }),
  ],
  build: {
    minify: false,
  },
});
