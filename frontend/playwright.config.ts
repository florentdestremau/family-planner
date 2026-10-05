import { defineConfig, devices } from "@playwright/test";

const PORT = 8123;

// Vrai back FastAPI (base SQLite jetable, fixtures chargées) qui sert le front compilé.
// E2E_SKIP_FRONT_BUILD=1 : réutilise frontend/dist (déjà construit en CI).
const build = process.env.E2E_SKIP_FRONT_BUILD ? "true" : "npm run build";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: [
      build,
      "rm -f ../backend/e2e.db*",
      `cd ../backend && DATABASE_URL=sqlite:///./e2e.db STATIC_DIR=../frontend/dist FIXTURES=true uv run uvicorn app.main:app --port ${PORT}`,
    ].join(" && "),
    url: `http://127.0.0.1:${PORT}/up`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
