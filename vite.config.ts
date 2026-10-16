import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
const cacheModules = "C:/Users/cybereun/AppData/Local/J-Dir-Cache/node_modules";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  cacheDir: "C:/Users/cybereun/AppData/Local/J-Dir-Cache/.vite",
  resolve: {
    alias: {
      react: path.join(cacheModules, "react"),
      "react-dom": path.join(cacheModules, "react-dom"),
      "lucide-react": path.join(cacheModules, "lucide-react"),
      "@tauri-apps/api": path.join(cacheModules, "@tauri-apps/api"),
      "@tauri-apps/plugin-dialog": path.join(cacheModules, "@tauri-apps/plugin-dialog"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
