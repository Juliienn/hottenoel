import { defineConfig, devices } from "@playwright/test";

// Parcours réels dans le navigateur, sur le build de production (next start)
// et une base dédiée vidée avant chaque lancement (cf. tests/e2e/prepare-db.ts).
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5433/hotte_e2e";
export const E2E_SETUP_TOKEN = "jeton-installation-e2e-0123456789";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx tests/e2e/prepare-db.ts && npx next start -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100/connexion",
    reuseExistingServer: false,
    env: { DATABASE_URL: E2E_DB, DIRECT_URL: E2E_DB, SETUP_TOKEN: E2E_SETUP_TOKEN },
  },
});
