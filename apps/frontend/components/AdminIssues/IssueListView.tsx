'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_PAGE_SIZE,
  ISSUE_SORT_KEYS,
  ISSUE_SORT_OPTIONS,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  sortIssues,
  useAdminIssues,
  type AdminIssue,
  type IssueSortKey,
  type IssueStatusLabel,
  type SortDirection,
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
  const [sortKey, setSortKey] = useState<IssueSortKey>('reported');
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    ISSUE_SORT_OPTIONS.reported.defaultDirection
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  // A different filter has a different number of pages; always start from page 1.
  function changeStatus(next: IssueStatusLabel | undefined) {
    setStatus(next);
    setPage(1);
  }

  function clearSearch() {
    setInput('');
    setQ('');
    setPage(1);
    inputRef.current?.focus();
  }

  function changeSortKey(next: IssueSortKey) {
    setSortKey(next);
    setSortDirection(ISSUE_SORT_OPTIONS[next].defaultDirection);
    setPage(1);
  }

  function changeSortDirection(next: SortDirection) {
    setSortDirection(next);
    setPage(1);
  }

  const { issues, isLoading, isFetching, error, retry } = useAdminIssues({ q, status });

  // The API has no sort parameter, so the whole filtered set is sorted and paged here.
  const sorted = useMemo(
    () => (issues ? sortIssues(issues, sortKey, sortDirection) : []),
    [issues, sortKey, sortDirection]
  );

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  // Issues can disappear between fetches; never sit on a page past the end.
  if (issues && page > pageCount) setPage(pageCount);

  const first = total === 0 ? 0 : (page - 1) * DEFAULT_PAGE_SIZE + 1;
  const last = Math.min(page * DEFAULT_PAGE_SIZE, total);
  const visible = sorted.slice(first - 1, last);

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
            placeholder="Search by table ID or description"
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
          <StatusTab active={!status} onClick={() => changeStatus(undefined)}>
            All
          </StatusTab>
          {ISSUE_STATUSES.map((s: IssueStatusLabel) => (
            <StatusTab key={s} active={status === s} onClick={() => changeStatus(s)}>
              {ISSUE_STATUS_LABELS[s]}
            </StatusTab>
          ))}
        </div>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-paper shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
          <p className="text-sm text-gray-600" aria-live="polite">
            {isLoading
              ? 'Loading issues…'
              : error && !issues
                ? 'Failed to load'
                : total === 0
                  ? 'No issues'
                  : `${first}–${last} of ${total} ${total === 1 ? 'issue' : 'issues'}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SortSelect
              id="admin-issue-sort"
              label="Sort by"
              value={sortKey}
              onChange={(v) => changeSortKey(v as IssueSortKey)}
              options={ISSUE_SORT_KEYS.map((k) => [k, ISSUE_SORT_OPTIONS[k].label])}
            />
            <SortSelect
              id="admin-issue-order"
              label="Order"
              value={sortDirection}
              onChange={(v) => changeSortDirection(v as SortDirection)}
              options={Object.entries(ISSUE_SORT_OPTIONS[sortKey].directions)}
            />
          </div>
        </div>

        {error && issues && (
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
        ) : error && !issues ? (
          <IssueError message={error.message} onRetry={retry} />
        ) : total === 0 ? (
          <IssueEmpty query={q} filtered={Boolean(status)} onClear={clearSearch} />
        ) : (
          <div
            aria-busy={isFetching}
            className={`transition-opacity duration-150 ${isFetching ? 'opacity-60' : ''}`}
          >
            <IssueResultsList issues={visible} />
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

function SortSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [value: string, label: string][];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs text-gray-500">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 bg-paper py-1 pl-2 pr-7 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
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
  return (
    <div>
      <ul className="divide-y divide-gray-100">
        {issues.map((issue) => (
          <li
            key={issue.issueId}
            className="px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4 md:flex-nowrap md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-gray-900 truncate">#{issue.issueId}</span>
                  <span className="text-gray-400 text-xs font-mono tabular-nums">
                    Table {issue.table.tableId}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-sm text-gray-600 lg:line-clamp-2">
                  {issue.issueInformation}
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Zone {issue.table.zoneType} &middot; Reported{' '}
                  <time dateTime={issue.time}>
                    {new Date(issue.time).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </time>
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 md:flex-row md:items-center md:gap-4">
                <span
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    STATUS_COLOR[issue.status]
                  }`}
                >
                  {issue.status}
                </span>
                {issue.blocksTable && (
                  <span className="inline-block rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    Blocks table
                  </span>
                )}
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {issue.user.firstname} {issue.user.lastname}
                  </p>
                  <p className="text-xs text-gray-500">{issue.user.email}</p>
                </div>
              </div>
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
          : "The issue service didn't respond. Check your connection and try again."}
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
          ? 'Check the spelling, or try a table ID instead.'
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
