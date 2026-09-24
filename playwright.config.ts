import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end smoke tests against a production build.
 * Run `npm run build` first, then `npm run e2e`.
 * Set PW_CHROMIUM_PATH to use a preinstalled Chromium instead of Playwright's own.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
