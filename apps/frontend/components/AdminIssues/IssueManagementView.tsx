'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ADMIN_ISSUE_PAGE_SIZE,
  ISSUE_STATUSES,
  listAdminIssues,
  updateAdminIssue,
} from '@/lib/adminIssues';
import type { AdminIssue, IssueStatus } from '@/lib/adminIssues';

const STATUS_STYLE: Record<IssueStatus, string> = {
  Pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  'In Progress': 'bg-blue-50 text-blue-800 ring-blue-200',
  Completed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
};

type IssueDraft = {
  status: IssueStatus;
  blocksTable: boolean;
  notes: string;
  notesTouched: boolean;
};

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function makeDraft(issue: AdminIssue): IssueDraft {
  return {
    status: issue.status,
    blocksTable: issue.blocksTable,
    notes: '',
    notesTouched: false,
  };
}

function draftIsEdited(draft: IssueDraft, issue: AdminIssue): boolean {
  const notesChanged = draft.notesTouched && draft.notes !== (issue.notes ?? '');

  return draft.status !== issue.status || draft.blocksTable !== issue.blocksTable || notesChanged;
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 88)}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      maxLength={2000}
      rows={3}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mt-1 block w-full resize-none overflow-hidden rounded-md border border-gray-300 px-3 py-2 font-normal outline-none placeholder:text-gray-400 focus:border-chula-pink focus:ring-2 focus:ring-chula-pink/20"
    />
  );
}

export function IssueManagementView() {
  const [issues, setIssues] = useState<AdminIssue[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, IssueDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<number>>(() => new Set());

  const requestSeq = useRef(0);

  const pageCount = Math.max(1, Math.ceil(total / ADMIN_ISSUE_PAGE_SIZE));

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const seq = ++requestSeq.current;

      setLoading(true);
      setError(null);

      try {
        const result = await listAdminIssues(
          {
            q: query,
            status: statusFilter || undefined,
            page,
            pageSize: ADMIN_ISSUE_PAGE_SIZE,
          },
          signal
        );

        // Ignore results from a request that was superseded by a newer one.
        if (seq !== requestSeq.current) return;

        setIssues(result.issues);
        setTotal(result.total);

        setDrafts((current) => {
          const next: Record<number, IssueDraft> = {};

          for (const issue of result.issues) {
            const draft = current[issue.issueId];

            // Keep a draft only while the admin has unsaved edits.
            // Otherwise refresh it from the latest server response.
            next[issue.issueId] = draft && draftIsEdited(draft, issue) ? draft : makeDraft(issue);
          }

          return next;
        });
      } catch (cause) {
        if (seq !== requestSeq.current) return;

        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Failed to load issue reports.');
        }
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [query, statusFilter, page]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), query ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      requestSeq.current += 1;
    };
  }, [load, query]);

  useEffect(() => {
    if (!loading && page > pageCount) {
      setPage(pageCount);
    }
  }, [loading, page, pageCount]);

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function edit(
    issue: AdminIssue,
    field: 'status' | 'blocksTable' | 'notes',
    value: string | boolean
  ) {
    setDrafts((current) => {
      const draft = current[issue.issueId] ?? makeDraft(issue);

      return {
        ...current,
        [issue.issueId]: {
          ...draft,
          status: field === 'status' ? (value as IssueStatus) : draft.status,
          blocksTable:
            field === 'blocksTable'
              ? (value as boolean)
              : field === 'status' && value !== 'In Progress'
                ? false
                : draft.blocksTable,
          notes: field === 'notes' ? (value as string) : draft.notes,
          notesTouched: field === 'notes' ? true : draft.notesTouched,
        },
      };
    });
  }

  function discardNoteEdit(issue: AdminIssue) {
    setDrafts((current) => {
      const draft = current[issue.issueId] ?? makeDraft(issue);

      return {
        ...current,
        [issue.issueId]: {
          ...draft,
          notes: '',
          notesTouched: false,
        },
      };
    });
  }

  function isDirty(issue: AdminIssue): boolean {
    const draft = drafts[issue.issueId];
    return !!draft && draftIsEdited(draft, issue);
  }

  async function save(issue: AdminIssue) {
    const draft = drafts[issue.issueId];
    if (!draft || !isDirty(issue)) return;

    setSavingIds((current) => new Set(current).add(issue.issueId));
    setError(null);
    setNotice(null);

    const notesToSave = draft.notesTouched ? draft.notes : (issue.notes ?? '');

    try {
      await updateAdminIssue(issue.issueId, {
        status: draft.status,
        blocksTable: draft.blocksTable,
        notes: notesToSave,
      });

      setNotice(`Changes to issue #${issue.issueId} were saved.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save changes.');
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(issue.issueId);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-chula-pink">Facility &amp; Issue Management</p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">Reported issues</h2>
          <p className="mt-1 text-sm text-gray-600">
            Review reported issues, update their status, and add maintenance notes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </header>

      <section
        className="mb-4 grid gap-3 rounded-xl border border-hairline bg-white p-4 sm:grid-cols-[minmax(0,1fr)_220px]"
        aria-label="Filter issues"
      >
        <label className="text-sm font-medium text-gray-700">
          Search description or table number
          <input
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="e.g. broken outlet or 101"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-normal outline-none focus:border-chula-pink focus:ring-2 focus:ring-chula-pink/20"
          />
        </label>

        <label className="text-sm font-medium text-gray-700">
          Filter by status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as IssueStatus | '');
              setPage(1);
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-normal outline-none focus:border-chula-pink focus:ring-2 focus:ring-chula-pink/20"
          >
            <option value="">All statuses</option>
            {ISSUE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </section>

      {notice && (
        <div
          role="status"
          className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-hairline bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 text-sm text-gray-600">
          <span>{loading ? 'Loading…' : `${total} issues total`}</span>
          <span>
            Page {page} of {pageCount}
          </span>
        </div>

        {loading && issues.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">Loading issue reports…</p>
        ) : issues.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No issues found.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {issues.map((issue) => {
              const draft = drafts[issue.issueId] ?? makeDraft(issue);
              const dirty = isDirty(issue);
              const saving = savingIds.has(issue.issueId);
              const hasSavedNote = Boolean(issue.notes?.trim());
              const notesPlaceholder = draft.notesTouched
                ? 'Add repair progress or other maintenance notes…'
                : issue.notes || 'Add repair progress or other maintenance notes…';

              return (
                <li key={issue.issueId} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">Issue #{issue.issueId}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[issue.status]}`}
                        >
                          {issue.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          Reported {formatDate(issue.time)}
                        </span>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                        {issue.issueInformation}
                      </p>
                      <p className="mt-2 text-sm text-gray-600">
                        Table {issue.table.tableId} · Zone {issue.table.zoneId} (
                        {issue.table.zoneType})
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Reported by: {issue.user.firstname} {issue.user.lastname} ·{' '}
                        {issue.user.email}
                      </p>
                    </div>

                    <div className="grid w-full gap-3 lg:max-w-sm">
                      <label className="text-sm font-medium text-gray-700">
                        Status
                        <select
                          value={draft.status}
                          onChange={(event) => edit(issue, 'status', event.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-normal outline-none focus:border-chula-pink focus:ring-2 focus:ring-chula-pink/20"
                        >
                          {ISSUE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      {draft.status === 'In Progress' && (
                        <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-gray-800">
                          <input
                            type="checkbox"
                            checked={draft.blocksTable}
                            onChange={(event) => edit(issue, 'blocksTable', event.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                          />
                          <span>
                            <span className="block font-medium">Close table during repair</span>
                            <span className="mt-0.5 block text-xs leading-5 text-gray-600">
                              When enabled, the table is marked CLOSED, new holds and bookings are
                              blocked, and existing holds are cleared.
                            </span>
                          </span>
                        </label>
                      )}

                      {issue.blocksTable && !draft.blocksTable && (
                        <p className="rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                          Saving will reopen this table and recalculate its effective status.
                        </p>
                      )}

                      <label className="text-sm font-medium text-gray-700">
                        Maintenance notes
                        <AutoGrowTextarea
                          value={draft.notes}
                          onChange={(value) => edit(issue, 'notes', value)}
                          placeholder={notesPlaceholder}
                        />
                        <span className="mt-1 block text-right text-xs font-normal text-gray-500">
                          {draft.notes.length}/2000
                        </span>
                      </label>

                      {hasSavedNote && !draft.notesTouched && (
                        <button
                          type="button"
                          onClick={() => edit(issue, 'notes', '')}
                          className="-mt-2 justify-self-start text-xs font-medium text-red-700 underline"
                        >
                          Clear saved note
                        </button>
                      )}

                      {hasSavedNote && draft.notesTouched && (
                        <button
                          type="button"
                          onClick={() => discardNoteEdit(issue)}
                          className="-mt-2 justify-self-start text-xs font-medium text-gray-600 underline"
                        >
                          Discard note edit
                        </button>
                      )}

                      {draft.notesTouched && draft.notes === '' && hasSavedNote && (
                        <p className="-mt-2 text-xs text-amber-700">
                          The saved note will be cleared when you save.
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={!dirty || saving || draft.notes.length > 2000}
                        onClick={() => void save(issue)}
                        className="rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => value - 1)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Showing {issues.length ? (page - 1) * ADMIN_ISSUE_PAGE_SIZE + 1 : 0}–
            {Math.min(page * ADMIN_ISSUE_PAGE_SIZE, total)} of {total}
          </span>
          <button
            type="button"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
          >
            Next
          </button>
        </footer>
      </div>
    </div>
  );
}
