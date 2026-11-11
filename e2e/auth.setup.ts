import { expect, test as setup } from '@playwright/test';
import {
  ADMIN_STATE,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  CURRENT_CONSENT_VERSION,
  USER_STATE,
  testEnv,
} from './helpers/auth';

setup('sign in as admin through the login page', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByLabel('Email').fill(testEnv.adminEmail);
  await page.getByLabel('Password').fill(testEnv.adminPassword);
  await page.getByRole('button', { name: 'Login as Admin' }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});

// Google OAuth cannot be automated, so the user session comes from the backend's
// dev login (POST /api/auth/login) and is stored the same way the app stores it.
setup('sign in as a user through the dev login API', async ({ page, request }) => {
  const response = await request.post(`${testEnv.apiUrl}/api/auth/login`, {
    data: {
      email: testEnv.userEmail,
      firstname: testEnv.userFirstname,
      lastname: testEnv.userLastname,
      consent: true,
      consentVersion: CURRENT_CONSENT_VERSION,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { token, user } = await response.json();

  await page.goto('/');
  await page.evaluate(
    ([tokenKey, userKey, savedToken, savedUser]) => {
      localStorage.setItem(tokenKey, savedToken);
      localStorage.setItem(userKey, savedUser);
    },
    [AUTH_TOKEN_KEY, AUTH_USER_KEY, token, JSON.stringify(user)]
  );
  await page.reload();

  await expect(page.getByRole('button', { name: `Open menu for ${user.firstname}` })).toBeVisible();
  await page.context().storageState({ path: USER_STATE });
});
