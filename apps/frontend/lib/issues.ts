import { API_URL, getAuthToken } from './auth';

export interface CreateIssueReportInput {
  tableId: number;
  issueInformation: string;
}

export type CreateIssueReportResult =
  { ok: true; issueId: number; time: string } | { ok: false; error: string };

export async function createIssueReport(
  input: CreateIssueReportInput
): Promise<CreateIssueReportResult> {
  const token = getAuthToken();

  if (!token) {
    return { ok: false, error: 'Please sign in again before submitting a report.' };
  }

  try {
    const response = await fetch(`${API_URL}/api/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });

    const body = await response.json().catch(() => null);

    if (response.ok && body?.success === true) {
      return {
        ok: true,
        issueId: body.data.issueId,
        time: body.data.time,
      };
    }

    return {
      ok: false,
      error: body?.error || `Could not submit the report (${response.status}).`,
    };
  } catch {
    return {
      ok: false,
      error: 'Unable to connect to the server. Please try again.',
    };
  }
}
