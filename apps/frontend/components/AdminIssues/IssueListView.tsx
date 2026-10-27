'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_PAGE_SIZE,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  useAdminIssues,
  type AdminIssue,
  type IssueStatusLabel,
} from '@/lib/adminIssues';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, SearchIcon } from './icons';

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_COLOR: Record<IssueStatusLabel, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function IssueListView() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<IssueStatusLabel | undefined>(undefined);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  function clearSearch() {
    setInput('');
    setQ('');
    setPage(1);
    inputRef.current?.focus();
  }

  const {
    page: result,
    isLoading,
    isFetching,
    error,
    retry,
  } = useAdminIssues({
    q,
    status,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const total = result?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * DEFAULT_PAGE_SIZE + 1;
  const last = Math.min(page * DEFAULT_PAGE_SIZE, total);
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  return (
    <div className="min-w-0">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input.trim());
          setPage(1);
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label htmlFor="admin-issue-search" className="sr-only">
          Search issues
        </label>
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            id="admin-issue-search"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && input) {
                e.preventDefault();
                clearSearch();
              }
            }}
            placeholder="Search by table ID, zone, or description"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-gray-300 bg-paper py-2 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-200 [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <CloseIcon width={16} height={16} />
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Issue status"
          className="flex flex-none overflow-x-auto rounded-md bg-gray-100 p-1 gap-1"
        >
          <StatusTab active={!status} onClick={() => setStatus(undefined)}>
            All
          </StatusTab>
          {ISSUE_STATUSES.map((s: IssueStatusLabel) => (
            <StatusTab key={s} active={status === s} onClick={() => setStatus(s)}>
              {ISSUE_STATUS_LABELS[s]}
            </StatusTab>
          ))}
        </div>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-paper shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
          <p className="text-sm text-gray-600" aria-live="polite">
            {isLoading
              ? 'Loading issues…'
              : error && !result
                ? 'Failed to load'
                : total === 0
                  ? 'No issues'
                  : `${first}–${last} of ${total} ${total === 1 ? 'issue' : 'issues'}`}
          </p>
        </div>

        {error && result && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 bg-red-50 px-4 py-2 text-sm text-red-700"
          >
            <span>Couldn&apos;t refresh — showing the last results.</span>
            <button
              type="button"
              onClick={retry}
              className="font-medium underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <IssueSkeleton />
        ) : error && !result ? (
          <IssueError message={error.message} onRetry={retry} />
        ) : total === 0 ? (
          <IssueEmpty query={q} filtered={Boolean(status)} onClear={clearSearch} />
        ) : (
          <div
            aria-busy={isFetching}
            className={`transition-opacity duration-150 ${isFetching ? 'opacity-60' : ''}`}
          >
            <IssueResultsList issues={result!.issues} />
          </div>
        )}

        {pageCount > 1 && !isLoading && (
          <nav
            aria-label="Issue pages"
            className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5"
          >
            <span className="text-sm text-gray-500 tabular-nums">
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <PageButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeftIcon width={16} height={16} /> Previous
              </PageButton>
              <PageButton disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRightIcon width={16} height={16} />
              </PageButton>
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

function StatusTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
        active ? 'bg-paper text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

function PageButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-paper"
    >
      {children}
    </button>
  );
}

function IssueResultsList({ issues }: { issues: AdminIssue[] }) {
  const COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_8rem_9rem_10rem_6rem] md:items-center md:gap-4';

  return (
    <div>
      <div
        aria-hidden="true"
        className={`hidden border-b border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 ${COLS}`}
      >
        <span>Table / Zone</span>
        <span>Reported by</span>
        <span className="text-right">Reported at</span>
        <span className="text-right">Status</span>
      </div>

      <ul className="divide-y divide-gray-100">
        {issues.map((issue) => (
          <li key={issue.issueId} className={COLS}>
            <div className="px-4 py-3 text-left transition-colors hover:bg-gray-50">
              <span className="block text-sm font-medium text-gray-900 truncate">
                Table {issue.table.tableId}
              </span>
              <span className="block truncate text-sm text-gray-500">
                Zone {issue.table.zoneType}
              </span>
            </div>
            <div className="px-4 py-3 text-left">
              <span className="block truncate text-sm font-medium text-gray-900">
                {issue.user.firstname} {issue.user.lastname}
              </span>
              <span className="block truncate text-sm text-gray-500">{issue.user.email}</span>
            </div>
            <div className="px-4 py-3 text-right">
              <span className="block text-sm text-gray-600 tabular-nums">
                {new Date(issue.time).toLocaleString(undefined, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            <div className="px-4 py-3 text-right">
              <span
                className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  STATUS_COLOR[issue.status]
                }`}
              >
                {issue.status}
              </span>
              {issue.blocksTable && (
                <span className="ml-2 inline-block rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  Blocks table
                </span>
              )}
            </div>
            <div className="md:hidden px-4 py-2 text-left">
              <p className="text-sm text-gray-700 truncate">{issue.issueInformation}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IssueSkeleton() {
  return (
    <ul className="animate-pulse divide-y divide-gray-100" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="space-y-2">
            <div className="h-3.5 w-32 rounded bg-gray-200" />
            <div className="h-3 w-48 rounded bg-gray-100" />
          </div>
          <div className="space-y-2">
            <div className="h-3.5 w-40 rounded bg-gray-200" />
            <div className="h-3 w-48 rounded bg-gray-100" />
          </div>
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
        </li>
      ))}
    </ul>
  );
}

function IssueError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const isSession = message.toLowerCase().includes('session');
  return (
    <div role="alert" className="px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-gray-900">Couldn&apos;t load issue reports</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
        {isSession
          ? message
          : 'The issue service didn&apos;t respond. Check your connection and try again.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md bg-chula-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-chula-pink-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </div>
  );
}

function IssueEmpty({
  query,
  filtered,
  onClear,
}: {
  query: string;
  filtered: boolean;
  onClear: () => void;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-gray-400">📋</p>
      <h2 className="mt-2 text-base font-semibold text-gray-900">
        {query
          ? `No issues match “${query}”`
          : filtered
            ? 'No issues of this status'
            : 'No issues yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
        {query
          ? 'Check the spelling, or try a table ID or zone name instead.'
          : filtered
            ? 'Switch the status back to All to see every issue.'
            : 'Issue reports appear here after members submit them.'}
      </p>
      {query && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 rounded-md border border-gray-300 bg-paper px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          Clear search
        </button>
      )}
    </div>
  );
}
