import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const host = env.VITE_DEV_HOST || env.HOST || "127.0.0.1";
  const portRaw = env.VITE_DEV_PORT || env.PORT || "5180";
  const port = Number(portRaw);

  return {
    clearScreen: false,
    server: {
      host,
      port: Number.isFinite(port) ? port : 5180,
      strictPort: false,
    },
  };
});

