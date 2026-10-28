'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createIssueReport, type CreateIssueReportResult } from '@/lib/issues';
import IssueReportResultModal from './IssueReportResultModal';

export interface IssueReportLocation {
  tableId: number;
  tableCode: string;
  zoneId: number;
  zoneLabel: string;
}

interface IssueReportModalProps {
  location: IssueReportLocation;
  onClose: () => void;
}

export default function IssueReportModal({ location, onClose }: IssueReportModalProps) {
  const [details, setDetails] = useState('');
  const [reportedAt] = useState(() => new Date().toISOString());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateIssueReportResult | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const timestampLabel = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const issueInformation = details.trim();
    if (issueInformation.length < 5 || submitting) return;

    setSubmitting(true);

    const response = await createIssueReport({
      tableId: location.tableId,
      issueInformation,
    });

    setResult(response);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-report-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      >
        <div>
          <h2 id="issue-report-title" className="text-xl font-semibold text-gray-900">
            Report a facility issue
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Describe the problem so the library team can follow up.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1.5 ml-1 block text-sm text-gray-500">Table</span>
              <p className="rounded-xl bg-gray-100 px-4 py-3 text-gray-700">
                {location.tableCode} (ID {location.tableId})
              </p>
            </div>

            <div>
              <span className="mb-1.5 ml-1 block text-sm text-gray-500">Zone</span>
              <p className="rounded-xl bg-gray-100 px-4 py-3 text-gray-700">
                {location.zoneLabel} (ID {location.zoneId})
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="issue-timestamp" className="mb-1.5 ml-1 block text-sm text-gray-500">
              Report timestamp
            </label>
            <input
              id="issue-timestamp"
              type="text"
              readOnly
              value={timestampLabel}
              className="w-full rounded-xl bg-gray-200 px-4 py-3 text-gray-700 focus:outline-none"
            />
            <p className="ml-1 text-xs text-gray-500">
              The server records the official submission time.
            </p>
          </div>

          <div>
            <label htmlFor="issue-details" className="mb-1.5 ml-1 block text-sm text-gray-500">
              Issue details <span className="text-red-500">*</span>
            </label>
            <textarea
              id="issue-details"
              name="details"
              required
              minLength={5}
              maxLength={1000}
              rows={5}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Describe the issue..."
              className="w-full resize-none rounded-xl bg-gray-200 px-4 py-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <p className="ml-1 text-xs text-gray-500">5–1000 characters.</p>
          </div>

          <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={details.trim().length < 5 || submitting}
              className="rounded-full bg-chula-pink px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-chula-pink-hover focus:outline-none focus:ring-2 focus:ring-chula-pink focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </section>

      {result && (
        <IssueReportResultModal result={result} onClose={onClose} onRetry={() => setResult(null)} />
      )}
    </div>
  );
}
