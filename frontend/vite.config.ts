import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // timeout увеличен: запросы агента (LLM + MCP + x402) могут идти 30–60с
      "/api": {
        target: "http://127.0.0.1:8799",
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
});
