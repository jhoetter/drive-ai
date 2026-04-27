import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const r = (p: string) => path.join(fileURLToPath(new URL(".", import.meta.url)), p);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": r("src"),
    },
  },
  server: {
    port: 3500,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.VITE_DRIVEAI_API_URL ?? "http://127.0.0.1:3520",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
  define: {
    "import.meta.env.HOFOS_MODE": JSON.stringify(process.env.HOFOS_MODE === "1"),
  },
});
