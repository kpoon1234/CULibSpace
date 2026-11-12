import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { ADMIN_STATE, testEnv } from './helpers/auth';
import { adminToken } from './helpers/adminApi';

test.use({ storageState: ADMIN_STATE });

type Schedule = {
  scheduleId: number;
  name: string;
  priority: number;
  startDate: string;
  endDate: string;
};

type Draft = {
  name: string;
  start: string;
  end: string;
  opens: string;
  closes: string;
  priority: '1' | '2' | '3';
  hours: 'Set hours' | 'Open 24 hours' | 'Closed';
};

const API = `${testEnv.apiUrl}/api/admin/schedules`;
const START = '2030-01-10';
const END = '2030-01-20';

let prefix: string;
let name: string;

const headers = () => ({
  Authorization: `Bearer ${adminToken()}`,
});

const schedules = (page: Page) =>
  page.getByRole('region', { name: 'Operating schedules', exact: true });

function row(page: Page, scheduleName: string) {
  return schedules(page).getByRole('row').filter({
    has: page.getByRole('cell', { name: scheduleName, exact: true }),
  });
}

async function listSchedules(request: APIRequestContext): Promise<Schedule[]> {
  const result: Schedule[] = [];
  let page = 1;
  let total = Infinity;

  while (result.length < total) {
    const response = await request.get(API, {
      headers: headers(),
      params: { page, pageSize: 100 },
    });
    expect(response.ok(), await response.text()).toBe(true);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);

    const batch = body.data as Schedule[];
    result.push(...batch);
    total = body.total ?? result.length;

    if (batch.length === 0) break;
    page++;
  }

  return result;
}

test.beforeEach(async ({ page, request }) => {
  prefix = `E2E ${randomUUID()}`;
  name = `${prefix} schedule`;

  const existing = await listSchedules(request);
  const conflicts = existing.filter(
    (schedule) =>
      [1, 2, 3].includes(schedule.priority) &&
      schedule.startDate.slice(0, 10) <= END &&
      schedule.endDate.slice(0, 10) >= START
  );

  expect(
    conflicts,
    'Precondition: 2030-01-10 through 2030-01-20 must be free ' +
      'of existing schedules with priority 1, 2 or 3.'
  ).toEqual([]);

  await page.goto('/admin/settings');
  await expect(schedules(page)).toBeVisible();
  await expect(
    schedules(page).getByRole('button', { name: 'Refresh', exact: true })
  ).toBeEnabled();
});

test.afterEach(async ({ request }) => {
  // Query by this test's unique prefix, so cleanup still finds records
  // when the UI assertion failed after the server saved them.
  const owned = (await listSchedules(request)).filter(
    (schedule) => schedule.name.startsWith(`${prefix} `)
  );

  const failures: string[] = [];
  for (const schedule of owned) {
    const response = await request.delete(
      `${API}/${schedule.scheduleId}`,
      { headers: headers() }
    );
    if (!response.ok() && response.status() !== 404) {
      failures.push(`${schedule.scheduleId}: ${await response.text()}`);
    }
  }

  expect(failures, 'Schedule cleanup failed').toEqual([]);
});

async function openForm(
  page: Page,
  overrides: Partial<Draft> = {}
): Promise<Locator> {
  const draft: Draft = {
    name,
    start: START,
    end: END,
    opens: '08:00',
    closes: '20:00',
    priority: '1',
    hours: 'Set hours',
    ...overrides,
  };

  const regular = draft.priority === '1';
  await schedules(page).getByRole('button', {
    name: regular ? 'Add regular schedule' : 'Add exception',
    exact: true,
  }).click();

  const form = page.getByRole('form', {
    name: regular ? 'New regular schedule' : 'New exception',
    exact: true,
  });

  await form.getByLabel(/^Name/).fill(draft.name);
  await form.getByLabel(/^Type/).selectOption(draft.priority);
  await form.getByLabel(/^Start date/).fill(draft.start);
  await form.getByLabel(/^End date/).fill(draft.end);

  // Click the visible label because the radio input is visually hidden.
  await form.getByText(draft.hours, { exact: true }).click();
  await expect(form.getByRole('radio', { name: draft.hours, exact: true }))
    .toBeChecked();

  if (draft.hours === 'Set hours') {
    await form.getByLabel(/^Opens/).fill(draft.opens);
    await form.getByLabel(/^Closes/).fill(draft.closes);
  }

  return form;
}

async function create(
  page: Page,
  overrides: Partial<Draft> = {}
) {
  const scheduleName = overrides.name ?? name;
  const form = await openForm(page, overrides);
  await form.getByRole('button', { name: 'Add schedule', exact: true }).click();

  await expect(schedules(page).getByRole('status')).toHaveText(
    `Added “${scheduleName}”.`
  );
  await expect(row(page, scheduleName)).toBeVisible();
}

async function expectPersisted(
  page: Page,
  scheduleName: string,
  hours: string,
  dates: string
) {
  await page.reload();
  const saved = row(page, scheduleName);
  await expect(saved).toBeVisible();
  await expect(saved.getByRole('cell', { name: hours, exact: true }))
    .toBeVisible();
  await expect(saved.getByRole('cell', { name: dates, exact: true }))
    .toBeVisible();
}

async function expectInvalid(
  page: Page,
  form: Locator,
  field: RegExp,
  message: string
) {
  await form.getByRole('button', { name: 'Add schedule', exact: true }).click();

  await expect(form.getByLabel(field)).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  await expect(form.getByLabel(field)).toHaveAccessibleDescription(message);
  await expect(form.getByText(message, { exact: true })).toBeVisible();

  // Check that an invalid form did not add a row.
  await page.reload();
  await expect(
    schedules(page).getByRole('button', { name: 'Refresh', exact: true })
  ).toBeEnabled();
  await expect(row(page, name)).toHaveCount(0);
}

test('TC-7.4-01 settings show regular hours and exceptions', async ({
  page,
}) => {
  const regularName = `${prefix} regular`;
  const exceptionName = `${prefix} exception`;

  await create(page, { name: regularName });
  await create(page, {
    name: exceptionName,
    priority: '2',
    hours: 'Open 24 hours',
  });
  await page.reload();

  const regular = schedules(page).getByRole('region', {
    name: 'Regular hours',
    exact: true,
  });
  const exceptions = schedules(page).getByRole('region', {
    name: 'Exceptions',
    exact: true,
  });

  await expect(regular.getByRole('cell', { name: regularName, exact: true }))
    .toBeVisible();
  await expect(regular.getByRole('row').filter({
    has: page.getByRole('cell', { name: regularName, exact: true }),
  })).toContainText('08:00–20:00');

  await expect(exceptions.getByRole('cell', {
    name: exceptionName,
    exact: true,
  })).toBeVisible();
  await expect(row(page, exceptionName)).toContainText('Open 24 hours');
});

test('TC-7.4-02 add a regular schedule', async ({ page }) => {
  await create(page);
  await expectPersisted(
    page, name, '08:00–20:00', '10 Jan 2030 – 20 Jan 2030'
  );
});

test('TC-7.4-03 add an Open 24 hours exception', async ({ page }) => {
  await create(page, { priority: '2', hours: 'Open 24 hours' });
  await expectPersisted(
    page, name, 'Open 24 hours', '10 Jan 2030 – 20 Jan 2030'
  );
  await expect(row(page, name)).toContainText('Exam period');
});

test('TC-7.4-04 add a Closed holiday', async ({ page }) => {
  await create(page, { priority: '3', hours: 'Closed' });
  await expectPersisted(
    page, name, 'Closed', '10 Jan 2030 – 20 Jan 2030'
  );
  await expect(row(page, name)).toContainText('Holiday / closure');
});

test('TC-7.4-05 empty name is rejected', async ({ page }) => {
  const form = await openForm(page, { name: '' });
  await expectInvalid(page, form, /^Name/, 'Enter a name.');
});

for (const missing of ['start', 'end'] as const) {
  test(`TC-7.4-06 missing ${missing} date is rejected`, async ({ page }) => {
    const form = await openForm(page, { [missing]: '' });

    await expectInvalid(
      page,
      form,
      missing === 'start' ? /^Start date/ : /^End date/,
      missing === 'start' ? 'Choose a start date.' : 'Choose an end date.'
    );
  });
}

test('TC-7.4-07 same start and end date is accepted', async ({ page }) => {
  await create(page, { end: START });
  await expectPersisted(page, name, '08:00–20:00', '10 Jan 2030');
});

test('TC-7.4-08 end date before start date is rejected', async ({ page }) => {
  const form = await openForm(page, { end: '2030-01-09' });
  await expectInvalid(
    page, form, /^End date/, 'End date cannot be before the start date.'
  );
});

test('TC-7.4-09 equal opening and closing times are rejected', async ({
  page,
}) => {
  const form = await openForm(page, { closes: '08:00' });
  await expectInvalid(
    page, form, /^Closes/, 'Closing time must be after opening time.'
  );
});

test('TC-7.4-10 closing one minute after opening is accepted', async ({
  page,
}) => {
  await create(page, { closes: '08:01' });
  await expectPersisted(
    page, name, '08:00–08:01', '10 Jan 2030 – 20 Jan 2030'
  );
});

test('TC-7.4-11 edit the schedule name', async ({ page }) => {
  await create(page);
  const renamed = `${prefix} renamed`;

  await row(page, name).getByRole('button', {
    name: `Edit ${name}`,
    exact: true,
  }).click();

  const form = page.getByRole('form', {
    name: `Edit “${name}”`,
    exact: true,
  });
  await form.getByLabel(/^Name/).fill(renamed);
  await form.getByRole('button', { name: 'Save changes', exact: true }).click();

  await expect(schedules(page).getByRole('status')).toHaveText(
    `Saved changes to “${renamed}”.`
  );

  await expectPersisted(
    page, renamed, '08:00–20:00', '10 Jan 2030 – 20 Jan 2030'
  );
  await expect(row(page, name)).toHaveCount(0);
});

test('TC-7.4-12 delete a schedule after confirmation', async ({ page }) => {
  await create(page);

  await row(page, name).getByRole('button', {
    name: `Delete ${name}`,
    exact: true,
  }).click();

  // Asking for confirmation must not delete the row yet.
  await expect(row(page, name)).toBeVisible();
  await row(page, name).getByRole('button', {
    name: `Confirm deleting ${name}`,
    exact: true,
  }).click();

  await expect(schedules(page).getByRole('status')).toHaveText(
    `Deleted “${name}”.`
  );

  await page.reload();
  await expect(
    schedules(page).getByRole('button', { name: 'Refresh', exact: true })
  ).toBeEnabled();
  await expect(row(page, name)).toHaveCount(0);
});