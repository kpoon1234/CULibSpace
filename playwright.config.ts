import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Optional local overrides (URLs, test accounts). See e2e/.env.example.
if (fs.existsSync('e2e/.env')) process.loadEnvFile('e2e/.env');

const FRONTEND_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:8080';

const isLocal = (url: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);

/** The port a URL points to, including the default for its scheme. */
const portOf = (url: string) => {
  const { port, protocol } = new URL(url);
  return port || (protocol === 'https:' ? '443' : '80');
};

/**
 * Black-box E2E tests against the running app: the local dev servers by default,
 * or a deployed environment when E2E_BASE_URL / E2E_API_URL point to it.
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
  // Local URLs: starts the dev servers if they are not already running (reuses them
  // if they are). A deployed URL is already running, so nothing is started.
  // Each server starts on the port of its E2E URL, and is told where the other one is
  // (backend CORS origin, frontend API URL), so custom local ports work end to end.
  webServer: [
    ...(isLocal(API_URL)
      ? [
          {
            command: 'npm run dev:backend',
            url: `${API_URL}/api/hello`,
            env: { PORT: portOf(API_URL), CLIENT_URL: new URL(FRONTEND_URL).origin },
            reuseExistingServer: true,
            timeout: 120_000,
          },
        ]
      : []),
    ...(isLocal(FRONTEND_URL)
      ? [
          {
            command: 'npm run dev:frontend',
            url: FRONTEND_URL,
            env: {
              PORT: portOf(FRONTEND_URL),
              NEXT_PUBLIC_API_URL: new URL(API_URL).origin,
              // next dev only serves its scripts to trusted hosts; trust the E2E host
              // (e.g. 127.0.0.1), or the page never becomes interactive.
              ALLOWED_DEV_ORIGINS: new URL(FRONTEND_URL).hostname.replace(/^\[(.*)\]$/, '$1'),
            },
            reuseExistingServer: true,
            timeout: 180_000,
          },
        ]
      : []),
  ],
});
