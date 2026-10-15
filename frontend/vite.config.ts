import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    // Change à chaque build : invalide les données gardées hors ligne quand le code change de version.
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  plugins: [
    react(),
    VitePWA({
      // Une nouvelle version attend le clic sur « Recharger » (pas de rechargement en pleine saisie).
      registerType: "prompt",
      // Les icônes ne servent qu'à l'installation : inutile de les garder hors ligne.
      includeManifestIcons: false,
      manifest: {
        name: "Week-end en famille",
        short_name: "Week-end",
        description: "Menus, chambres, activités, présences et corvées du séjour en famille.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#e8632c",
        background_color: "#fff8f0",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // L'interface est mise en cache ; les données passent par le cache de React Query (main.tsx).
        globPatterns: ["**/*.{js,css,html}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//u, /^\/up$/u],
      },
    }),
  ],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // La logique pure ; l'interface est couverte par les tests e2e (e2e/).
      include: ["src/lib.ts", "src/storage.ts", "src/api.ts", "src/pwa.ts"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
