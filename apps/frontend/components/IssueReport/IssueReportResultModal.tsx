'use client';

import type { CreateIssueReportResult } from '@/lib/issues';

interface IssueReportResultModalProps {
  result: CreateIssueReportResult;
  onClose: () => void;
  onRetry: () => void;
}

export default function IssueReportResultModal({
  result,
  onClose,
  onRetry,
}: IssueReportResultModalProps) {
  const isSuccess = result.ok;

  const submittedAt = isSuccess
    ? new Intl.DateTimeFormat('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(result.time))
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in rounded-3xl bg-white p-6 shadow-2xl fade-in zoom-in-95 duration-200 sm:p-8">
        {isSuccess ? (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>

            <h2 className="mt-4 text-2xl font-semibold text-gray-900">Issue Report Successful</h2>

            <div className="mt-2 space-y-1 text-sm text-gray-500">
              <p>Your issue report has been submitted.</p>
              <p>Issue ID: {result.issueId}</p>
              {submittedAt && <p>Submitted: {submittedAt}</p>}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-8 w-full rounded-full bg-emerald-400 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
            >
              Back to main menu
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 shadow-md">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>

            <h2 className="mt-4 text-2xl font-semibold text-gray-900">Issue Report Unsuccessful</h2>

            <p className="mt-2 text-sm text-gray-500">{result.error}</p>

            <button
              type="button"
              onClick={onRetry}
              className="mt-8 w-full rounded-full bg-rose-400 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2"
            >
              Try again
            </button>

            <button
              type="button"
              onClick={onClose}
              className="mt-3 text-sm text-gray-600 underline"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
