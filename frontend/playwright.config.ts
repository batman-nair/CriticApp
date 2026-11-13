import { defineConfig, devices } from '@playwright/test'

// The smoke test runs against the production image, started outside
// Playwright (see the README, or the image job in the frontend workflow).
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost:8080',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
