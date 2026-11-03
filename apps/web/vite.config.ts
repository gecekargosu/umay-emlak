import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Geliştirmede arayüz 5173, API 3100.
 * /api istekleri proxy ile geçer: tarayıcı açısından tek köken olur, böylece
 * httpOnly oturum çerezi CORS derdi olmadan çalışır.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3100",
        changeOrigin: false,
      },
    },
  },
});
