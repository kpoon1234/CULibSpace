import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  CURRENT_CONSENT_VERSION,
} from '../../apps/frontend/lib/auth';

export { AUTH_TOKEN_KEY, AUTH_USER_KEY, CURRENT_CONSENT_VERSION };

/** Saved browser sessions, written by e2e/auth.setup.ts (git-ignored). */
export const ADMIN_STATE = 'playwright/.auth/admin.json';
export const USER_STATE = 'playwright/.auth/user.json';

/**
 * Test accounts. Defaults are the accounts from apps/backend/prisma/seed.ts;
 * override them in e2e/.env if your local database has different data.
 */
export const testEnv = {
  apiUrl: process.env.E2E_API_URL || 'http://localhost:8080',
  adminEmail: process.env.E2E_ADMIN_EMAIL || 'admin@chula.ac.th',
  adminPassword: process.env.E2E_ADMIN_PASSWORD || 'admin',
  userEmail: process.env.E2E_USER_EMAIL || 'alice@student.chula.ac.th',
  userFirstname: process.env.E2E_USER_FIRSTNAME || 'Alice',
  userLastname: process.env.E2E_USER_LASTNAME || 'wonderland',
};
