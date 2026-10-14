// Génère les icônes de l'appli (public/) : 🎉 sur le dégradé de la marque, rendu par Chromium.
// Usage : node scripts/icons.mjs (nécessite une police emoji couleur, ex. Noto Color Emoji).
import { chromium } from "@playwright/test";

const ICONS = [
  // Icônes « any » : coins arrondis, emoji large.
  { file: "pwa-192.png", size: 192, radius: 0.22, emoji: 0.62 },
  { file: "pwa-512.png", size: 512, radius: 0.22, emoji: 0.62 },
  // Maskable : fond plein bord à bord, emoji dans la zone sûre (cercle de 80 %).
  { file: "maskable-512.png", size: 512, radius: 0, emoji: 0.5 },
  // iOS arrondit lui-même les coins.
  { file: "apple-touch-icon.png", size: 180, radius: 0, emoji: 0.6 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, radius, emoji } of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; background: transparent; }
      div {
        width: ${size}px; height: ${size}px; border-radius: ${radius * size}px;
        background: linear-gradient(135deg, #e8632c 0%, #f5a623 100%);
        display: grid; place-items: center;
        font: ${emoji * size}px/1 "Noto Color Emoji", "Apple Color Emoji", sans-serif;
      }
    </style>
    <div>🎉</div>`);
  await page.locator("div").screenshot({ path: `public/${file}`, omitBackground: true });
  console.log(`public/${file}`);
}
await browser.close();
