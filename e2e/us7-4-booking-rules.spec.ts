import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE } from './helpers/auth';
import {
  getBookingRules,
  setBookingRules,
  type BookingRuleField,
  type BookingRules,
} from './helpers/adminApi';

// US7-4 (part B): booking rules on /admin/settings. Test cases TC-7.4-13 .. 20
// in e2e/TEST_CASES.md. Every test starts from BASELINE and the admin's
// original values are put back afterwards, even when a test fails.

test.use({ storageState: ADMIN_STATE });

const BASELINE: BookingRules = {
  maxBookingDurationMinutes: 120,
  maxAdvanceBookingDays: 7,
  minScoreToBook: 50,
  earlyCheckInMinutes: 15,
  lateThresholdMinutes: 15,
};

const SAVED_NOTICE = 'Booking policy saved. New bookings follow these limits right away.';

type FieldSpec = { field: BookingRuleField; label: string; min: number; max: number };

const FIELDS: FieldSpec[] = [
  { field: 'maxBookingDurationMinutes', label: 'Longest booking', min: 15, max: 1440 },
  { field: 'maxAdvanceBookingDays', label: 'Book ahead up to', min: 1, max: 365 },
  { field: 'minScoreToBook', label: 'Minimum behaviour score', min: 0, max: 100 },
  { field: 'earlyCheckInMinutes', label: 'Early check-in', min: 1, max: 180 },
  { field: 'lateThresholdMinutes', label: 'No-show after', min: 1, max: 180 },
];

const LABEL: Record<BookingRuleField, string> = Object.fromEntries(
  FIELDS.map((spec) => [spec.field, spec.label])
) as Record<BookingRuleField, string>;

/**
 * "No-show after" must stay shorter than "Longest booking". These boundary values
 * break that rule against BASELINE, so the other field is moved out of the way.
 */
const KEEP_VALID: Partial<Record<string, Partial<BookingRules>>> = {
  'maxBookingDurationMinutes=15': { lateThresholdMinutes: 14 },
  'lateThresholdMinutes=180': { maxBookingDurationMinutes: 1440 },
};

let original: BookingRules;

test.beforeEach(async ({ page, request }) => {
  original = await getBookingRules(request);
  await setBookingRules(request, BASELINE);
  await page.goto('/admin/settings');
  await expect(fieldInput(page, 'maxBookingDurationMinutes')).toHaveValue(
    String(BASELINE.maxBookingDurationMinutes)
  );
});

test.afterEach(async ({ request }) => {
  await setBookingRules(request, original);
});

function policySection(page: Page) {
  return page.getByRole('region', { name: 'Booking policy' });
}

function fieldInput(page: Page, field: BookingRuleField) {
  return policySection(page).getByLabel(LABEL[field], { exact: true });
}

async function fillRules(page: Page, values: Partial<Record<BookingRuleField, string>>) {
  for (const [field, value] of Object.entries(values) as [BookingRuleField, string][]) {
    await fieldInput(page, field).fill(value);
  }
}

async function save(page: Page) {
  await policySection(page).getByRole('button', { name: 'Save policy' }).click();
}

async function expectRejected(page: Page, field: BookingRuleField, message: string) {
  const input = fieldInput(page, field);
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAccessibleDescription(new RegExp(escapeRegExp(message)));
  await expect(policySection(page).getByRole('status')).not.toHaveText(SAVED_NOTICE);
}

/** After a reload, every field shows `expected` — i.e. what the server stored. */
async function expectStored(page: Page, expected: BookingRules) {
  await page.reload();
  for (const field of Object.keys(expected) as BookingRuleField[]) {
    await expect(fieldInput(page, field)).toHaveValue(String(expected[field]));
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('TC-7.4-13 valid boundaries (min, max) are saved', () => {
  for (const spec of FIELDS) {
    for (const value of [spec.min, spec.max]) {
      test(`${spec.label} = ${value}`, async ({ page }) => {
        const extra = KEEP_VALID[`${spec.field}=${value}`] ?? {};
        const expected: BookingRules = { ...BASELINE, ...extra, [spec.field]: value };

        await fillRules(page, {
          ...Object.fromEntries(Object.entries(extra).map(([f, v]) => [f, String(v)])),
          [spec.field]: String(value),
        });
        await save(page);

        await expect(policySection(page).getByRole('status')).toHaveText(SAVED_NOTICE);
        await expectStored(page, expected);
      });
    }
  }
});

test.describe('TC-7.4-14 invalid boundaries (min-1, max+1) are rejected', () => {
  for (const spec of FIELDS) {
    for (const value of [spec.min - 1, spec.max + 1]) {
      test(`${spec.label} = ${value}`, async ({ page }) => {
        await fillRules(page, { [spec.field]: String(value) });
        await save(page);

        // A negative number fails the whole-number check before the range check.
        const message =
          value < 0 ? 'Enter a whole number.' : `Enter between ${spec.min} and ${spec.max}.`;
        await expectRejected(page, spec.field, message);
        await expectStored(page, BASELINE);
      });
    }
  }
});

test('TC-7.4-15 a decimal is rejected', async ({ page }) => {
  await fillRules(page, { maxBookingDurationMinutes: '1.5' });
  await save(page);

  await expectRejected(page, 'maxBookingDurationMinutes', 'Enter a whole number.');
  await expectStored(page, BASELINE);
});

test('TC-7.4-16 letters are rejected', async ({ page }) => {
  await fillRules(page, { maxAdvanceBookingDays: 'abc' });
  await save(page);

  await expectRejected(page, 'maxAdvanceBookingDays', 'Enter a whole number.');
  await expectStored(page, BASELINE);
});

test('TC-7.4-17 an empty field is rejected', async ({ page }) => {
  await fillRules(page, { minScoreToBook: '' });
  await save(page);

  await expectRejected(page, 'minScoreToBook', 'Enter a value.');
  await expectStored(page, BASELINE);
});

test('TC-7.4-18 "No-show after" equal to "Longest booking" is rejected', async ({ page }) => {
  await fillRules(page, { maxBookingDurationMinutes: '60', lateThresholdMinutes: '60' });
  await save(page);

  await expectRejected(page, 'lateThresholdMinutes', 'Must be shorter than the longest booking.');
  await expectStored(page, BASELINE);
});

test('TC-7.4-19 "No-show after" one minute shorter than "Longest booking" is saved', async ({
  page,
}) => {
  await fillRules(page, { maxBookingDurationMinutes: '60', lateThresholdMinutes: '59' });
  await save(page);

  await expect(policySection(page).getByRole('status')).toHaveText(SAVED_NOTICE);
  await expectStored(page, {
    ...BASELINE,
    maxBookingDurationMinutes: 60,
    lateThresholdMinutes: 59,
  });
});

test('TC-7.4-20 "Discard changes" restores the saved values without saving', async ({ page }) => {
  await fillRules(page, { maxAdvanceBookingDays: '30', earlyCheckInMinutes: '45' });
  await policySection(page).getByRole('button', { name: 'Discard changes' }).click();

  await expect(fieldInput(page, 'maxAdvanceBookingDays')).toHaveValue('7');
  await expect(fieldInput(page, 'earlyCheckInMinutes')).toHaveValue('15');
  await expect(policySection(page).getByRole('button', { name: 'Save policy' })).toBeDisabled();
  await expectStored(page, BASELINE);
});
