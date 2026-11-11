import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { USER_STATE } from './auth';

/** A description that no other run uses, so tests can find their own issue. */
export function uniqueIssueText(label: string): string {
  return `E2E ${label} ${new Date().toISOString()}`;
}

export type ReportedTable = { tableCode: string; tableId: number };

/**
 * Opens the floor plan the way a user does: home page → "Report Issue".
 * Loading /zones directly currently redirects to /login and then home (defect:
 * the page sees no token during hydration), so tests must not use goto('/zones').
 */
export async function openFloorPlanFromHome(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Choose a table before reporting a facility issue' })
    .click();
  await page.waitForURL('**/zones');
  await expect(page.getByRole('heading', { name: 'Floor plan' })).toBeVisible();
}

/**
 * Reports an issue as the signed-in user through the UI: /zones → first available
 * table → "Report an issue with this table" → submit. Uses its own browser context
 * so it can run inside an admin test.
 */
export async function reportIssueAsUser(
  browser: Browser,
  testInfo: TestInfo,
  description: string
): Promise<ReportedTable> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: USER_STATE,
  });
  const page = await context.newPage();
  try {
    await openFloorPlanFromHome(page);
    await page
      .getByRole('button', { name: /^Table \S+, Available\./ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Report an issue with this table' }).click();

    const form = page.getByRole('dialog', { name: 'Report a facility issue' });
    const tableText = await form
      .getByText(/^\S+ \(ID \d+\)$/)
      .first()
      .textContent();
    const match = /^(\S+) \(ID (\d+)\)$/.exec(tableText?.trim() ?? '');
    expect(match, `table shown in the report form: "${tableText}"`).not.toBeNull();

    await form.getByLabel('Issue details').fill(description);
    await form.getByRole('button', { name: 'Submit report' }).click();
    await expect(page.getByRole('heading', { name: 'Issue Report Successful' })).toBeVisible();

    return { tableCode: match![1], tableId: Number(match![2]) };
  } finally {
    await context.close();
  }
}

/** Opens /admin/issues, searches for the description, and returns that issue's row. */
export async function openAdminIssue(page: Page, description: string) {
  await page.goto('/admin/issues');
  await page.getByLabel('Search description or table number').fill(description);
  const row = page.getByRole('listitem').filter({ hasText: description });
  await expect(row).toHaveCount(1);
  return row;
}

/** The status label of a table on the /zones floor plan, e.g. "Available" or "Closed". */
export async function tableStatusOnFloorPlan(
  browser: Browser,
  testInfo: TestInfo,
  tableCode: string
): Promise<string> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: USER_STATE,
  });
  const page = await context.newPage();
  try {
    await openFloorPlanFromHome(page);
    const table = page.getByLabel(new RegExp(`^Table ${tableCode}, `));
    await expect(table).toBeVisible();
    const label = (await table.getAttribute('aria-label')) ?? '';
    return /^Table \S+, ([^.]+)\./.exec(label)?.[1] ?? label;
  } finally {
    await context.close();
  }
}
