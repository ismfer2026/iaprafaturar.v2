import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "icon-192x192.png", "icon-512x512.png"],
      manifest: {
        name: "iaprafaturar - Portal do Cliente",
        short_name: "iaprafaturar",
        description: "Portal publico para agendamentos e formularios de atendimento",
        theme_color: "#0f766e",
        background_color: "#f7fbf9",
        display: "standalone",
        display_override: ["standalone"],
        orientation: "portrait",
        lang: "pt-BR",
        scope: "/",
        start_url: "/?pwa=1",
        icons: [
          { src: "icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"]
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
    sourcemap: true
  },
  server: {
    port: 5174,
    host: true
  }
});
