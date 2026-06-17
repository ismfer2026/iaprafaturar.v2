import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "icon-192x192.png", "icon-512x512.png"],
      manifest: {
        name: "iaprafaturar Admin",
        short_name: "ia$ Admin",
        description: "Painel administrativo da plataforma iaprafaturar",
        theme_color: "#7C3AED",
        background_color: "#f8fafc",
        display: "standalone",
        display_override: ["standalone"],
        orientation: "portrait",
        lang: "pt-BR",
        scope: "/",
        start_url: "/dashboard?pwa=1",
        icons: [
          { src: "icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (id.includes("node_modules/@tanstack")) return "query";
          if (id.includes("node_modules/react-router")) return "router";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
          if (id.includes("node_modules/@radix-ui") || id.includes("packages/ui")) return "ui";
          if (id.includes("node_modules/lucide-react")) return "icons";
        }
      }
    }
  },
  server: {
    port: 5175,
    host: true
  }
});
