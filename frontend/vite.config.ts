import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    fs: {
      allow: [".."],
    },
    proxy: {
      "/api": "http://localhost:3000",
      "/opds": "http://localhost:3000",
    },
  },
  build: {
    outDir: "../backend/public",
    emptyOutDir: true,
  },
});
