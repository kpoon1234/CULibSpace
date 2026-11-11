import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Optional local overrides (URLs, test accounts). See e2e/.env.example.
if (fs.existsSync('e2e/.env')) process.loadEnvFile('e2e/.env');

const FRONTEND_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:8080';

/**
 * Black-box E2E tests against the running app (frontend + backend + your local DB).
 * Tests change shared data (issues, schedules, settings), so they run one at a time.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Every test is recorded (as on the earlier playwright-kaopoon branch), so the
    // HTML report has a video for each test case.
    video: 'on',
  },
  projects: [
    // Signs in once as admin and as a user, and saves the sessions for the other tests.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  // Starts the dev servers if they are not already running (reuses them if they are).
  webServer: [
    {
      command: 'npm run dev:backend',
      url: `${API_URL}/api/hello`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:frontend',
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
