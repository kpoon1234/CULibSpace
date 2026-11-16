import { expect, test } from '@playwright/test';
import { ADMIN_STATE, USER_STATE } from './helpers/auth';

// Checks that the saved sessions from auth.setup.ts work. Real EPIC 7 tests go in
// their own files and use the same `test.use({ storageState })` pattern.

test.describe('admin session', () => {
  test.use({ storageState: ADMIN_STATE });

  test('admin can open the issue management page', async ({ page }) => {
    await page.goto('/admin/issues');
    await expect(page.getByRole('heading', { name: 'Reported issues' })).toBeVisible();
  });
});

test.describe('user session', () => {
  test.use({ storageState: USER_STATE });

  test('user is signed in on the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Open menu for / })).toBeVisible();
  });
});
