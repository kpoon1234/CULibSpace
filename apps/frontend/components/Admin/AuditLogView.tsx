'use client';

import { useEffect, useState } from 'react';
import {
  fetchAuditLogs,
  IS_MOCK_AUDIT_DATA,
  type AuditDirection,
  type AuditLogPage,
} from '@/lib/auditLogs';

const PAGE_SIZE = 20;

const DIRECTION_OPTIONS: { value: AuditDirection | ''; label: string }[] = [
  { value: '', label: 'All changes' },
  { value: 'deduct', label: 'Deductions' },
  { value: 'add', label: 'Additions' },
];

function formatTimestamp(iso: string): { date: string; time: string } {
  const dt = new Date(iso);
  return {
    date: dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

function ScoreBadge({ value }: { value: number }) {
  const tone =
    value < 0
      ? 'bg-red-50 text-red-600 ring-red-200'
      : value > 0
        ? 'bg-spruce/10 text-spruce ring-spruce/20'
        : 'bg-stone-100 text-stone-600 ring-stone-200';
  return (
    <span
      className={`inline-flex min-w-12 justify-center rounded-md px-2 py-0.5 font-mono text-sm font-semibold tabular-nums ring-1 ring-inset ${tone}`}
    >
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

const inputClass =
  'h-9 rounded-md border border-hairline bg-paper px-3 text-sm text-ink placeholder:text-stone-400 focus:border-chula-pink focus:outline-none focus:ring-2 focus:ring-chula-pink/20';

const pagerButtonClass =
  'rounded-md border border-hairline px-3 py-1.5 font-medium text-ink hover:border-chula-pink hover:text-chula-pink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-ink';

export default function AuditLogView({ token }: { token: string }) {
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [direction, setDirection] = useState<AuditDirection | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<AuditLogPage | null>(null);
  // Which request the latest response/error belongs to; loading = the current request has no answer yet.
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);
  const requestKey = JSON.stringify([q, direction, from, to, page, reloadKey]);
  const isLoading = settled?.key !== requestKey;
  const error = isLoading ? null : settled.error;

  // Debounce free-text search so each keystroke doesn't hit the API.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAuditLogs(
      token,
      { q, direction: direction || undefined, from, to, page, pageSize: PAGE_SIZE },
      controller.signal
    )
      .then((result) => {
        setData(result);
        setSettled({ key: requestKey, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({
          key: requestKey,
          error: err instanceof Error ? err.message : 'Failed to load audit logs',
        });
      });
    return () => controller.abort();
  }, [token, q, direction, from, to, page, requestKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = Boolean(searchInput || direction || from || to);

  const resetFilters = () => {
    setSearchInput('');
    setQ('');
    setDirection('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-paper shadow-sm">
      {IS_MOCK_AUDIT_DATA && (
        <p className="border-b border-brass-200 bg-brass-50 px-4 py-2 text-xs font-medium text-brass-800">
          Sample data — the audit-log API isn&apos;t available on main yet, so these entries are
          placeholders.
        </p>
      )}
      {/* Filters */}
      <div className="flex flex-col gap-3 border-b border-hairline p-4 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-stone-500">
          Search
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="User, student ID, admin, or reason"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
          Type
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as AuditDirection | '');
              setPage(1);
            }}
            className={inputClass}
          >
            {DIRECTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-stone-500">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-stone-500">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </label>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="h-9 rounded-md px-3 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>

      {/* Body */}
      {error ? (
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-3 text-sm font-medium text-chula-pink hover:underline"
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="p-10 text-center text-sm text-stone-500">Loading audit history…</p>
      ) : data.logs.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm font-medium text-ink">No audit entries found</p>
          <p className="mt-1 text-sm text-stone-500">
            {hasFilters
              ? 'Try widening the date range or clearing the filters.'
              : 'Score adjustments will appear here as they happen.'}
          </p>
        </div>
      ) : (
        <div className={`transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
          {/* Desktop table */}
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 text-center font-medium">Change</th>
                <th className="px-4 py-2.5 font-medium">Reason</th>
                <th className="px-4 py-2.5 font-medium">Performed by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {data.logs.map((log) => {
                const { date, time } = formatTimestamp(log.timestamp);
                return (
                  <tr key={log.id} className="align-top hover:bg-stone-50/60">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="text-ink">{date}</div>
                      <div className="text-xs tabular-nums text-stone-500">{time}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">
                        {log.user.firstname} {log.user.lastname}
                      </div>
                      <div className="text-xs text-stone-500">
                        {log.user.studentId ?? log.user.email}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScoreBadge value={log.scoreChange} />
                    </td>
                    <td className="max-w-sm px-4 py-3 text-stone-700">{log.reason}</td>
                    <td className="px-4 py-3">
                      <div className="text-ink">
                        {log.admin.firstname} {log.admin.lastname}
                      </div>
                      <div className="text-xs text-stone-500">{log.admin.email}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile list */}
          <ul className="divide-y divide-hairline md:hidden">
            {data.logs.map((log) => {
              const { date, time } = formatTimestamp(log.timestamp);
              return (
                <li key={log.id} className="flex gap-3 p-4">
                  <ScoreBadge value={log.scoreChange} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium text-ink">
                        {log.user.firstname} {log.user.lastname}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-stone-500">
                        {date} · {time}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-stone-700">{log.reason}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      by {log.admin.firstname} {log.admin.lastname}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 0 && !error && (
        <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-sm text-stone-500">
          <span className="tabular-nums">
            {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)}{' '}
            of {data.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => p - 1)}
              className={pagerButtonClass}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className={pagerButtonClass}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
