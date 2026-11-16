import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADMIN_STATE } from './helpers/auth';
import { findIssueId, updateIssue, type IssueStatus } from './helpers/adminApi';
import {
  openAdminIssue,
  reportIssueAsUser,
  tableStatusOnFloorPlan,
  uniqueIssueText,
  type ReportedTable,
} from './helpers/issues';

// US7-3: admin updates the status and notes of a reported issue, and the floor plan
// reflects tables closed for repair. Test cases TC-7.3-01 .. 12 in e2e/TEST_CASES.md.
// Each test reports its own issue as a user first; afterEach marks it Completed and
// not blocking, so the table is open again even if the test fails.

test.use({ storageState: ADMIN_STATE });

let description: string;
let issueId: number | undefined;
let table: ReportedTable;

test.beforeEach(async ({ browser, request }, testInfo) => {
  issueId = undefined;
  description = uniqueIssueText(testInfo.title.split(' ')[0]);
  table = await reportIssueAsUser(browser, testInfo, description);
  issueId = await findIssueId(request, description);
});

test.afterEach(async ({ request }) => {
  if (issueId !== undefined) {
    await updateIssue(request, issueId, { status: 'Completed', blocksTable: false });
  }
});

const statusSelect = (row: Locator) => row.getByRole('combobox');
const notesBox = (row: Locator) => row.getByRole('textbox');
const blockCheckbox = (row: Locator) =>
  row.getByRole('checkbox', { name: /Close table during repair/ });
const saveButton = (row: Locator) => row.getByRole('button', { name: 'Save changes' });

async function saveAndConfirm(page: Page, row: Locator) {
  await saveButton(row).click();
  await expect(page.getByRole('status').filter({ hasText: 'Changes to issue' })).toHaveText(
    `Changes to issue #${issueId} were saved.`
  );
}

/** Reloads the list and checks the stored status of this issue. */
async function expectStoredStatus(page: Page, status: IssueStatus) {
  const row = await openAdminIssue(page, description);
  await expect(statusSelect(row)).toHaveValue(status);
  return row;
}

test.describe('State transition', () => {
  test('TC-7.3-01 Pending → In Progress', async ({ page }) => {
    const row = await openAdminIssue(page, description);
    await expect(statusSelect(row)).toHaveValue('Pending');

    await statusSelect(row).selectOption('In Progress');
    await saveAndConfirm(page, row);

    await expectStoredStatus(page, 'In Progress');
  });

  test('TC-7.3-02 In Progress → Completed', async ({ page, request }) => {
    await updateIssue(request, issueId!, { status: 'In Progress', blocksTable: false });
    const row = await openAdminIssue(page, description);
    await expect(statusSelect(row)).toHaveValue('In Progress');

    await statusSelect(row).selectOption('Completed');
    await saveAndConfirm(page, row);

    await expectStoredStatus(page, 'Completed');
  });

  test('TC-7.3-03 Pending → Completed directly', async ({ page }) => {
    const row = await openAdminIssue(page, description);

    await statusSelect(row).selectOption('Completed');
    await saveAndConfirm(page, row);

    await expectStoredStatus(page, 'Completed');
  });

  test('TC-7.3-04 Completed → Pending (reopen)', async ({ page, request }) => {
    await updateIssue(request, issueId!, { status: 'Completed', blocksTable: false });
    const row = await openAdminIssue(page, description);
    await expect(statusSelect(row)).toHaveValue('Completed');

    await statusSelect(row).selectOption('Pending');
    await saveAndConfirm(page, row);

    await expectStoredStatus(page, 'Pending');
  });
});

test.describe('Maintenance notes', () => {
  test('TC-7.3-05 a note is saved without changing the status', async ({ page }) => {
    const note = `E2E note ${Date.now()}`;
    const row = await openAdminIssue(page, description);

    await notesBox(row).fill(note);
    await saveAndConfirm(page, row);

    // A saved note is shown as the placeholder of the empty notes box.
    const reloaded = await expectStoredStatus(page, 'Pending');
    await expect(notesBox(reloaded)).toHaveAttribute('placeholder', note);
    await expect(reloaded.getByRole('button', { name: 'Clear saved note' })).toBeVisible();
  });

  test('TC-7.3-06 a note of 2000 characters (max) is saved', async ({ page }) => {
    const note = 'n'.repeat(2000);
    const row = await openAdminIssue(page, description);

    await notesBox(row).fill(note);
    await expect(row.getByText('2000/2000')).toBeVisible();
    await saveAndConfirm(page, row);

    const reloaded = await expectStoredStatus(page, 'Pending');
    await expect(notesBox(reloaded)).toHaveAttribute('placeholder', note);
  });

  test('TC-7.3-07 a note longer than 2000 characters (max+1) is not accepted', async ({ page }) => {
    const row = await openAdminIssue(page, description);

    await notesBox(row).fill('n'.repeat(2001));

    const length = (await notesBox(row).inputValue()).length;
    if (length > 2000) {
      // The box took the extra character, so saving must be blocked.
      await expect(saveButton(row)).toBeDisabled();
    } else {
      expect(length).toBe(2000);
    }
  });

  test('TC-7.3-08 nothing changed → Save is disabled', async ({ page }) => {
    const row = await openAdminIssue(page, description);
    await expect(saveButton(row)).toBeDisabled();
  });
});

test.describe('Close table during repair → floor plan', () => {
  test('TC-7.3-09 In Progress + close table → table is Closed', async ({ page, browser }, info) => {
    const row = await openAdminIssue(page, description);

    await statusSelect(row).selectOption('In Progress');
    await blockCheckbox(row).check();
    await saveAndConfirm(page, row);
    await expect(row.getByText('Blocks table')).toBeVisible();

    expect(await tableStatusOnFloorPlan(browser, info, table.tableCode)).toBe('Closed');
  });

  test('TC-7.3-10 In Progress without closing → table is not Closed', async ({
    page,
    browser,
  }, info) => {
    const row = await openAdminIssue(page, description);

    await statusSelect(row).selectOption('In Progress');
    await expect(blockCheckbox(row)).not.toBeChecked();
    await saveAndConfirm(page, row);

    expect(await tableStatusOnFloorPlan(browser, info, table.tableCode)).not.toBe('Closed');
  });

  test('TC-7.3-11 Pending → no close option, table is not Closed', async ({
    page,
    browser,
  }, info) => {
    const row = await openAdminIssue(page, description);

    await expect(statusSelect(row)).toHaveValue('Pending');
    await expect(blockCheckbox(row)).toHaveCount(0);

    expect(await tableStatusOnFloorPlan(browser, info, table.tableCode)).not.toBe('Closed');
  });

  test('TC-7.3-12 closed table reopens when the issue is Completed', async ({
    page,
    browser,
    request,
  }, info) => {
    await updateIssue(request, issueId!, { status: 'In Progress', blocksTable: true });
    expect(await tableStatusOnFloorPlan(browser, info, table.tableCode)).toBe('Closed');

    const row = await openAdminIssue(page, description);
    await statusSelect(row).selectOption('Completed');
    await expect(row.getByText('Saving will reopen this table')).toBeVisible();
    await saveAndConfirm(page, row);

    expect(await tableStatusOnFloorPlan(browser, info, table.tableCode)).not.toBe('Closed');
  });
});
