import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API requests to the local relayer
      "/health": "http://localhost:8787",
      "/v1": "http://localhost:8787",
    },
  },
});
