import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { ADMIN_STATE, USER_STATE } from './helpers/auth';
import { updateIssue } from './helpers/adminApi';
import { openFloorPlanFromHome } from './helpers/issues';

test.use({ storageState: USER_STATE });

let createdIds: number[];
let form: Locator;
let selectedTableCode: string;

const details = () => form.getByLabel('Issue details');
const submitButton = () =>
  form.getByRole('button', { name: 'Submit report', exact: true });

test.beforeEach(async ({ page }) => {
  createdIds = [];

  await openFloorPlanFromHome(page);

  const table = page
    .getByRole('button', { name: /^Table \S+, Available\./ })
    .first();

  await expect(table).toBeVisible();
  const label = await table.getAttribute('aria-label');
  const match = /^Table (\S+),/.exec(label ?? '');
  expect(match).not.toBeNull();
  selectedTableCode = match![1];

  await table.click();
  await page
    .getByRole('button', { name: 'Report an issue with this table' })
    .click();

  form = page.getByRole('dialog', { name: 'Report a facility issue' });
  await expect(form).toBeVisible();
});

test.afterEach(async ({ request }) => {
  await Promise.all(
    createdIds.map((issueId) =>
      updateIssue(request, issueId, {
        status: 'Completed',
        blocksTable: false,
      })
    )
  );
});

async function submitReport(page: Page, text: string): Promise<number> {
  await details().fill(text);
  await expect(details()).toHaveValue(text);
  await expect(submitButton()).toBeEnabled();

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/issues' &&
      response.request().method() === 'POST'
  );

  await submitButton().click();
  const response = await responsePromise;
  const body = await response.json();

  // Register the created record before checking the resulting UI,
  // so afterEach still cleans it up if a later assertion fails.
  if (Number.isInteger(body?.data?.issueId)) {
    createdIds.push(body.data.issueId);
  }

  expect(response.ok(), JSON.stringify(body)).toBe(true);
  expect(body.success).toBe(true);
  expect(Number.isInteger(body.data.issueId)).toBe(true);

  await expect(
    page.getByRole('heading', { name: 'Issue Report Successful' })
  ).toBeVisible();

  return body.data.issueId;
}

async function inspectAdminSearch(
  browser: Browser,
  info: TestInfo,
  text: string,
  check: (page: Page) => Promise<void>
) {
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    storageState: ADMIN_STATE,
  });

  try {
    const page = await context.newPage();
    await page.goto('/admin/issues');
    await expect(
      page.getByRole('button', { name: 'Refresh', exact: true })
    ).toBeEnabled();

    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'GET' &&
        url.pathname === '/api/admin/issues' &&
        url.searchParams.get('q') === text &&
        url.searchParams.get('page') === '1'
      );
    });

    await page.getByLabel('Search description or table number').fill(text);
    const response = await responsePromise;
    expect(response.ok()).toBe(true);

    await expect(
      page.getByRole('button', { name: 'Refresh', exact: true })
    ).toBeEnabled();
    await expect(page.locator('#main-content').getByRole('alert')).toHaveCount(0);

    await check(page);
  } finally {
    await context.close();
  }
}

async function expectReportInAdmin(
  browser: Browser,
  info: TestInfo,
  issueId: number,
  text: string
) {
  await inspectAdminSearch(browser, info, text, async (page) => {
    const row = page.getByRole('listitem').filter({
      has: page.getByRole('heading', {
        name: `Issue #${issueId}`,
        exact: true,
      }),
    });

    await expect(row).toHaveCount(1);
    await expect(row.getByText(text, { exact: true })).toBeVisible();
    await expect(row.getByRole('combobox')).toHaveValue('Pending');
  });
}

test('TC-7.1-01 form shows table, zone and report time', async () => {
  await expect(
    form.getByText(
      `${selectedTableCode} (ID`,
      { exact: false }
    )
  ).toBeVisible();

  // The UI renders Table and Zone as label + value containers.
  const zone = form.getByText('Zone', { exact: true }).locator('..');
  await expect(zone.locator('p')).toHaveText(/\S.+\(ID \d+\)/);

  await expect(form.getByLabel('Report timestamp')).not.toHaveValue('');
  await expect(form.getByLabel('Report timestamp')).toHaveAttribute(
    'readonly',
    ''
  );
  await expect(details()).toBeVisible();
});

test('TC-7.1-02 valid report appears in admin list', async (
  { page, browser },
  info
) => {
  const text = `E2E ${randomUUID()} outlet broken`;
  const issueId = await submitReport(page, text);
  await expectReportInAdmin(browser, info, issueId, text);
});

test('TC-7.1-03 empty details are blocked with an error', async () => {
  await details().fill('');
  await details().focus();
  await details().blur();

  await expect(submitButton()).toBeDisabled();

  // Keep the AC expectation. The current UI may fail here because
  // disabling Submit prevents its validation message from appearing.
  await expect(form.getByRole('alert')).toHaveText(
    'Please describe the issue before submitting.'
  );
});

test('TC-7.1-04 whitespace-only details are rejected', async () => {
  await details().fill('     ');
  await expect(submitButton()).toBeDisabled();
});

test('TC-7.1-05 four characters are rejected', async () => {
  await details().fill('E2E!');
  await expect(submitButton()).toBeDisabled();
});

test('TC-7.1-06 five characters are accepted', async (
  { page, browser },
  info
) => {
  // Keep exactly five characters. Use the returned ID for identification.
  const text = 'E2E x';
  const issueId = await submitReport(page, text);
  await expectReportInAdmin(browser, info, issueId, text);
});

test('TC-7.1-07 one thousand characters are accepted', async (
  { page, browser },
  info
) => {
  const text = `E2E ${randomUUID()} `.padEnd(1000, 'x');
  const issueId = await submitReport(page, text);
  await expectReportInAdmin(browser, info, issueId, text);
});

test('TC-7.1-08 more than one thousand characters are limited or blocked', async () => {
  const text = `E2E ${randomUUID()} `.padEnd(1001, 'x');
  await details().fill(text);

  const entered = await details().inputValue();
  if (entered.length <= 1000) {
    expect(entered).toBe(text.slice(0, 1000));
  } else {
    await expect(submitButton()).toBeDisabled();
  }
});

test('TC-7.1-09 Cancel closes the form without creating an issue', async (
  { browser },
  info
) => {
  const text = `E2E ${randomUUID()} cancelled report`;
  await details().fill(text);
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(form).toBeHidden();

  await inspectAdminSearch(browser, info, text, async (page) => {
    const content = page.locator('#main-content');
    const issueRows = content.getByRole('listitem').filter({
        has: page.getByRole('heading', { name: /^Issue #\d+$/ }),
    });

    await expect(issueRows).toHaveCount(0);
    await expect(
        content.getByText('No issues found.', { exact: true })
    ).toBeVisible();
  });
});