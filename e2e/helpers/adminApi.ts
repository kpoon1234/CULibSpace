import fs from 'node:fs';
import { expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_STATE, AUTH_TOKEN_KEY, testEnv } from './auth';

// Setup and cleanup only. The behaviour under test always goes through the UI.

/** Reads the admin JWT from the session saved by auth.setup.ts. */
export function adminToken(): string {
  const state = JSON.parse(fs.readFileSync(ADMIN_STATE, 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  for (const origin of state.origins) {
    const entry = origin.localStorage.find((item) => item.name === AUTH_TOKEN_KEY);
    if (entry) return entry.value;
  }
  throw new Error(`No admin token in ${ADMIN_STATE}. Did the setup project run?`);
}

export const BOOKING_RULE_FIELDS = [
  'maxBookingDurationMinutes',
  'maxAdvanceBookingDays',
  'minScoreToBook',
  'earlyCheckInMinutes',
  'lateThresholdMinutes',
] as const;

export type BookingRuleField = (typeof BOOKING_RULE_FIELDS)[number];
export type BookingRules = Record<BookingRuleField, number>;

const POLICY_URL = () => `${testEnv.apiUrl}/api/system-config/policy`;
const authHeaders = () => ({ Authorization: `Bearer ${adminToken()}` });

export async function getBookingRules(request: APIRequestContext): Promise<BookingRules> {
  const response = await request.get(POLICY_URL(), { headers: authHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  const { data } = await response.json();
  return Object.fromEntries(
    BOOKING_RULE_FIELDS.map((field) => [field, Number(data[field])])
  ) as BookingRules;
}

export async function setBookingRules(request: APIRequestContext, rules: BookingRules) {
  const response = await request.put(POLICY_URL(), { headers: authHeaders(), data: rules });
  expect(response.ok(), await response.text()).toBe(true);
}

export type IssueStatus = 'Pending' | 'In Progress' | 'Completed';

/** The id of the one issue whose description contains `text`. */
export async function findIssueId(request: APIRequestContext, text: string): Promise<number> {
  const response = await request.get(`${testEnv.apiUrl}/api/admin/issues`, {
    headers: authHeaders(),
    params: { q: text },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { data } = (await response.json()) as { data: { issues: { issueId: number }[] } };
  expect(data.issues, `issues matching "${text}"`).toHaveLength(1);
  return data.issues[0].issueId;
}

export async function updateIssue(
  request: APIRequestContext,
  issueId: number,
  update: { status: IssueStatus; blocksTable: boolean; notes?: string }
) {
  // The API needs `notes` on every update; "" clears it.
  const response = await request.patch(`${testEnv.apiUrl}/api/admin/issues/${issueId}`, {
    headers: authHeaders(),
    data: { notes: '', ...update },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
