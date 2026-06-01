import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL || "http://localhost:3001";
  const buildId = new Date().toISOString();

  return {
    base: env.VITE_APP_BASE_PATH || "/",
    define: {
      __TERMER_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      allowedHosts: true,
    },
  };
});
