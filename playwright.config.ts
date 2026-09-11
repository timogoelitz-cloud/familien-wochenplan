import { defineConfig, devices } from '@playwright/test';

/**
 * Optionaler Pfad zu einem bereits vorhandenen Chromium.
 * Normalfall (Mac/Windows): nicht gesetzt -- Playwright nutzt seinen eigenen
 * Browser aus `npx playwright install chromium`.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions = executablePath ? { launchOptions: { executablePath } } : {};

/**
 * End-to-End-Tests laufen gegen den echten Dev-Server.
 * Das iPad-Profil ist die wichtigste Zielumgebung und deshalb ein eigenes
 * Projekt -- Touch-Bedienung und Hochformat werden dort mitgetestet.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], ...launchOptions },
    },
    {
      name: 'ipad',
      use: {
        ...devices['Desktop Chrome'],
        ...launchOptions,
        // iPad Pro 11" im Hochformat -- die wichtigste Zielgroesse.
        viewport: { width: 834, height: 1194 },
        isMobile: false,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
