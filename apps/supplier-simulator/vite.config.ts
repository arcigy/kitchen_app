import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  cacheDir: process.env.ARCIGY_VITE_CACHE_DIR,
  server: { host: "127.0.0.1", port: 5192, strictPort: true },
  preview: { host: "127.0.0.1", port: 5192, strictPort: true }
});
