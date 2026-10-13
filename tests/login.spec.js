import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Log In' }).click();
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('kaopoonjaidee@chula.ac.th');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('kaopoonjaidee');
  await page.getByRole('button', { name: 'Login as Admin' }).click();
  await expect(page.getByRole('button', { name: 'Open menu for Library' })).toMatchAriaSnapshot(`- button "Open menu for Library": L Library ADMIN`);
  await expect(page.locator('#main-content')).toMatchAriaSnapshot(`
    - heading "Admin Dashboard" [level=1]
    - paragraph: Welcome, Library. The administrative portal features will be implemented in future sprints.
    `);
  await page.goto('http://localhost:3000/admin');
});