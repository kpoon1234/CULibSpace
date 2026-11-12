import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADMIN_STATE } from './helpers/auth';
import {
  findIssueId,
  updateIssue,
  type IssueStatus,
} from './helpers/adminApi';
import {
  reportIssueAsUser,
  type ReportedTable,
} from './helpers/issues';

test.use({ storageState: ADMIN_STATE });
test.setTimeout(90_000);

type OwnIssue = {
  id: number;
  text: string;
  status: IssueStatus;
  table: ReportedTable;
};

const STATUSES: IssueStatus[] = ['Pending', 'In Progress', 'Completed'];

let ownIssues: OwnIssue[];
let createdIds: number[];
let marker: string;

test.beforeEach(async ({ browser, request }, info) => {
  ownIssues = [];
  createdIds = [];
  marker = `E2E ${randomUUID()}`;

  for (const status of STATUSES) {
    const text = `${marker} ${status}`;
    const table = await reportIssueAsUser(browser, info, text);
    const id = await findIssueId(request, text);
    createdIds.push(id);

    if (status !== 'Pending') {
      await updateIssue(request, id, { status, blocksTable: false });
    }

    ownIssues.push({ id, text, status, table });
  }
});

test.afterEach(async ({ request }) => {
  await Promise.all(
    createdIds.map((id) =>
      updateIssue(request, id, {
        status: 'Completed',
        blocksTable: false,
      })
    )
  );
});

function rows(page: Page) {
  return page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: /^Issue #\d+$/ }),
  });
}

function ownRow(page: Page, issue: OwnIssue) {
  return rows(page).filter({
    has: page.getByRole('heading', {
      name: `Issue #${issue.id}`,
      exact: true,
    }),
  });
}

async function ready(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Refresh', exact: true })
  ).toBeEnabled();
  await expect(page.locator('#main-content').getByRole('alert')).toHaveCount(0);
}

async function openIssues(page: Page) {
  await page.goto('/admin/issues');
  await expect(
    page.getByRole('heading', { name: 'Reported issues', exact: true })
  ).toBeVisible();
  await ready(page);
}

// Wait for the request for the intended filter, including the search debounce.
// No fixed sleep and no assumption about the total number of database rows.
async function filter(
  page: Page,
  next: { q?: string; status?: IssueStatus | '' }
) {
  const search = page.getByLabel('Search description or table number');
  const status = page.getByLabel('Filter by status');
  const q = next.q ?? (await search.inputValue());
  const selected = next.status ?? (await status.inputValue());

  if (
    q === (await search.inputValue()) &&
    selected === (await status.inputValue())
  ) {
    await ready(page);
    return;
  }

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname === '/api/admin/issues' &&
      (url.searchParams.get('q') ?? '') === q &&
      (url.searchParams.get('status') ?? '') === selected &&
      url.searchParams.get('page') === '1'
    );
  });

  if (next.q !== undefined) await search.fill(q);
  if (next.status !== undefined) await status.selectOption(selected);

  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  await ready(page);
}

async function inspectEveryPage(
  page: Page,
  inspect: (row: Locator) => Promise<void>
) {
  await expect(rows(page).first()).toBeVisible();

  while (true) {
    const count = await rows(page).count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index++) {
      await inspect(rows(page).nth(index));
    }

    const next = page.getByRole('button', { name: 'Next', exact: true });
    if (await next.isDisabled()) break;

    const indicator = page.getByText(/^Page \d+ of \d+$/);
    const previous = await indicator.innerText();
    await next.click();
    await expect(indicator).not.toHaveText(previous);
  }
}

test('TC-7.2-01 every displayed issue has its required information', async ({
  page,
}) => {
  await openIssues(page);

  await inspectEveryPage(page, async (row) => {
    await expect(row.getByRole('heading', { name: /^Issue #\d+$/ }))
      .toBeVisible();
    await expect(row.locator('p').first()).toHaveText(/\S/);
    await expect(row.getByText(/^Reported /).first()).toHaveText(
      /^Reported .+\d/
    );
    await expect(row.getByText(/^Table \d+ · Zone \d+/)).toBeVisible();
    await expect(row.getByRole('combobox')).toHaveValue(/^(Pending|In Progress|Completed)$/);
  });
});

test('TC-7.2-02 newly created issue appears in the list', async ({ page }) => {
  await openIssues(page);
  await expect(ownRow(page, ownIssues[0])).toBeVisible();
  await expect(
    ownRow(page, ownIssues[0]).getByText(ownIssues[0].text, { exact: true })
  ).toBeVisible();
});

for (const [index, status] of STATUSES.entries()) {
  test(`TC-7.2-0${index + 3} filter ${status}`, async ({ page }) => {
    await openIssues(page);
    await filter(page, { status });

    const target = ownIssues.find((issue) => issue.status === status)!;
    await expect(ownRow(page, target)).toBeVisible();

    for (const other of ownIssues.filter((issue) => issue.status !== status)) {
      await expect(ownRow(page, other)).toHaveCount(0);
    }

    await inspectEveryPage(page, async (row) => {
        await expect(row.getByRole('combobox')).toHaveValue(status);

        await expect(
            row.locator('span').filter({
                hasText: new RegExp(`^${status}$`),
            })
        ).toBeVisible();
    });
  });
}

test('TC-7.2-06 All statuses brings the pending issue back', async ({
  page,
}) => {
  await openIssues(page);
  await filter(page, { q: marker, status: 'Completed' });
  await expect(ownRow(page, ownIssues[0])).toHaveCount(0);

  await filter(page, { status: '' });
  for (const issue of ownIssues) {
    await expect(ownRow(page, issue)).toBeVisible();
  }
});

test('TC-7.2-07 description search returns matching issues only', async ({
  page,
}) => {
  await openIssues(page);
  await filter(page, { q: ownIssues[0].text });

  await expect(ownRow(page, ownIssues[0])).toBeVisible();
  await inspectEveryPage(page, async (row) => {
    await expect(row.locator('p').first()).toContainText(ownIssues[0].text);
  });

  for (const other of ownIssues.slice(1)) {
    await expect(ownRow(page, other)).toHaveCount(0);
  }
});

test('TC-7.2-08 table number search returns issues for that table', async ({
  page,
}) => {
  await openIssues(page);
  const tableId = ownIssues[0].table.tableId;
  await filter(page, { q: String(tableId) });

  await expect(ownRow(page, ownIssues[0])).toBeVisible();
  await inspectEveryPage(page, async (row) => {
    await expect(
      row.getByText(new RegExp(`^Table ${tableId} · Zone \\d+`))
    ).toBeVisible();
  });
});

test('TC-7.2-09 unmatched search shows the empty state', async ({ page }) => {
  await openIssues(page);
  await filter(page, { q: `zz-no-match-${randomUUID()}` });

  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('No issues found.', { exact: true }))
    .toBeVisible();
});

test('TC-7.2-10 search and status must both match', async ({ page }) => {
  await openIssues(page);

  // First prove the pending issue matches the search.
  await filter(page, { q: ownIssues[0].text });
  await expect(ownRow(page, ownIssues[0])).toBeVisible();

  await filter(page, { status: 'Completed' });
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('No issues found.', { exact: true }))
    .toBeVisible();
});