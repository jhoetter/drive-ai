import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const r = (p: string) => path.join(fileURLToPath(new URL(".", import.meta.url)), p);
const DESIGN_SYSTEM_IDS = ["default", "playful", "conservative"] as const;

function resolveDesignSystemId(): (typeof DESIGN_SYSTEM_IDS)[number] {
  const raw = (process.env.VITE_DESIGN_SYSTEM ?? process.env.DESIGN_SYSTEM ?? "default")
    .trim()
    .toLowerCase();
  return (DESIGN_SYSTEM_IDS as readonly string[]).includes(raw)
    ? (raw as (typeof DESIGN_SYSTEM_IDS)[number])
    : "default";
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": r("src"),
      "@driveai-design-system.css": r(`src/design-systems/${resolveDesignSystemId()}.css`),
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
