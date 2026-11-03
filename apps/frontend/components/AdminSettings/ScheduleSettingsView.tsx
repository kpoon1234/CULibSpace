'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  REGULAR_PRIORITY,
  createSchedule,
  dateRangeLabel,
  deleteSchedule,
  draftFromSchedule,
  emptyScheduleDraft,
  errorMessage,
  fetchActiveSchedule,
  groupSchedules,
  hoursLabel,
  listAllSchedules,
  priorityLabel,
  schedulePhase,
  todayKeyBangkok,
  updateSchedule,
} from '@/lib/adminSettings';
import type { OperatingSchedule, SchedulePayload, SchedulePhase } from '@/lib/adminSettings';
import { ScheduleForm } from './ScheduleForm';

const PHASE_STYLE: Record<SchedulePhase, string> = {
  current: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  upcoming: 'bg-blue-50 text-blue-800 ring-blue-200',
  past: 'bg-gray-50 text-gray-600 ring-gray-200',
};

const PHASE_LABEL: Record<SchedulePhase, string> = {
  current: 'In effect',
  upcoming: 'Upcoming',
  past: 'Ended',
};

const PRIORITY_STYLE: Record<number, string> = {
  2: 'bg-amber-50 text-amber-800 ring-amber-200',
  3: 'bg-red-50 text-red-700 ring-red-200',
};

const SECONDARY_BUTTON =
  'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50';

type Group = 'regular' | 'exception';

type Editor = { mode: 'create'; group: Group } | { mode: 'edit'; schedule: OperatingSchedule };

type ActiveState =
  | { kind: 'schedule'; schedule: OperatingSchedule }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

function groupOf(schedule: OperatingSchedule): Group {
  return schedule.priority === REGULAR_PRIORITY ? 'regular' : 'exception';
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

function TodayBanner({ active }: { active: ActiveState }) {
  if (active.kind === 'error') {
    return (
      <p className="text-sm text-red-700">
        Today&rsquo;s hours could not be determined: {active.message}
      </p>
    );
  }
  if (active.kind === 'none') {
    return (
      <p className="text-sm text-gray-700">
        <span className="font-semibold text-gray-900">No schedule covers today.</span> Bookings use
        the system&rsquo;s default opening hours.
      </p>
    );
  }
  const { schedule } = active;
  return (
    <p className="text-sm text-gray-700">
      <span className="font-semibold text-gray-900">
        {schedule.isClosed ? 'Closed today' : `Open today, ${hoursLabel(schedule)}`}
      </span>{' '}
      under <span className="font-medium text-gray-900">{schedule.name}</span> (
      {priorityLabel(schedule.priority).toLowerCase()}).
    </p>
  );
}

function RowActions({
  schedule,
  confirming,
  deleting,
  busy,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  schedule: OperatingSchedule;
  confirming: boolean;
  deleting: boolean;
  busy: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-gray-600">Delete?</span>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Confirm deleting ${schedule.name}`}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:bg-gray-300"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={onCancelDelete}
          disabled={deleting}
          className={SECONDARY_BUTTON}
        >
          Keep
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        aria-label={`Edit ${schedule.name}`}
        className={SECONDARY_BUTTON}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onAskDelete}
        disabled={busy}
        aria-label={`Delete ${schedule.name}`}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}

function ScheduleTable({
  schedules,
  todayKey,
  showType,
  emptyText,
  rowActions,
}: {
  schedules: OperatingSchedule[];
  todayKey: string;
  showType: boolean;
  emptyText: string;
  rowActions: (schedule: OperatingSchedule) => React.ReactNode;
}) {
  if (schedules.length === 0) {
    return <p className="p-8 text-center text-sm text-gray-500">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
          <tr>
            <th scope="col" className="px-4 py-2.5">
              Name
            </th>
            {showType && (
              <th scope="col" className="px-4 py-2.5">
                Type
              </th>
            )}
            <th scope="col" className="px-4 py-2.5">
              Dates
            </th>
            <th scope="col" className="px-4 py-2.5">
              Hours
            </th>
            <th scope="col" className="px-4 py-2.5">
              Status
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {schedules.map((schedule) => {
            const phase = schedulePhase(schedule, todayKey);
            return (
              <tr key={schedule.scheduleId} className={phase === 'past' ? 'text-gray-500' : ''}>
                <td className="px-4 py-3 font-medium text-gray-900">{schedule.name}</td>
                {showType && (
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        PRIORITY_STYLE[schedule.priority] ??
                        'bg-violet-50 text-violet-800 ring-violet-200'
                      }
                    >
                      {priorityLabel(schedule.priority)}
                    </Badge>
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                  {dateRangeLabel(schedule)}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 tabular-nums ${
                    schedule.isClosed ? 'font-medium text-red-700' : ''
                  }`}
                >
                  {hoursLabel(schedule)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={PHASE_STYLE[phase]}>{PHASE_LABEL[phase]}</Badge>
                </td>
                <td className="px-4 py-2">{rowActions(schedule)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ScheduleSettingsView() {
  const [schedules, setSchedules] = useState<OperatingSchedule[]>([]);
  const [active, setActive] = useState<ActiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(() => todayKeyBangkok());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    setTodayKey(todayKeyBangkok());

    const [listResult, activeResult] = await Promise.allSettled([
      listAllSchedules(controller.signal),
      fetchActiveSchedule(controller.signal),
    ]);
    if (controller.signal.aborted) return;

    if (listResult.status === 'fulfilled') {
      setSchedules(listResult.value);
    } else {
      setError(errorMessage(listResult.reason, 'Could not load schedules'));
    }

    if (activeResult.status === 'fulfilled') {
      setActive(
        activeResult.value ? { kind: 'schedule', schedule: activeResult.value } : { kind: 'none' }
      );
    } else {
      setActive({ kind: 'error', message: errorMessage(activeResult.reason, 'unknown error') });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial fetch on mount; load() sets state only after its requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const { regular, exceptions } = useMemo(
    () => groupSchedules(schedules, todayKey),
    [schedules, todayKey]
  );

  function openEditor(next: Editor) {
    setEditor(next);
    setConfirmingId(null);
    setNotice(null);
  }

  async function handleSubmit(payload: SchedulePayload) {
    // Errors propagate to the form, which shows them and stays open.
    if (editor?.mode === 'edit') {
      await updateSchedule(editor.schedule.scheduleId, payload);
      setNotice(`Saved changes to “${payload.name}”.`);
    } else {
      await createSchedule(payload);
      setNotice(`Added “${payload.name}”.`);
    }
    setEditor(null);
    await load();
  }

  async function handleDelete(schedule: OperatingSchedule) {
    setDeletingId(schedule.scheduleId);
    setNotice(null);
    try {
      await deleteSchedule(schedule.scheduleId);
      setNotice(`Deleted “${schedule.name}”.`);
      setConfirmingId(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the schedule.'));
    } finally {
      setDeletingId(null);
    }
  }

  const rowActions = (schedule: OperatingSchedule) => (
    <RowActions
      schedule={schedule}
      confirming={confirmingId === schedule.scheduleId}
      deleting={deletingId === schedule.scheduleId}
      busy={deletingId !== null}
      onEdit={() => openEditor({ mode: 'edit', schedule })}
      onAskDelete={() => {
        setConfirmingId(schedule.scheduleId);
        setEditor(null);
      }}
      onCancelDelete={() => setConfirmingId(null)}
      onDelete={() => void handleDelete(schedule)}
    />
  );

  function renderEditor(group: Group) {
    if (!editor) return null;
    if (editor.mode === 'create' && editor.group !== group) return null;
    if (editor.mode === 'edit' && groupOf(editor.schedule) !== group) return null;

    const isEdit = editor.mode === 'edit';
    const initial = isEdit
      ? draftFromSchedule(editor.schedule)
      : emptyScheduleDraft(group === 'regular' ? REGULAR_PRIORITY : 2, todayKey);
    return (
      <ScheduleForm
        key={isEdit ? `edit-${editor.schedule.scheduleId}` : `create-${group}`}
        title={
          isEdit
            ? `Edit “${editor.schedule.name}”`
            : group === 'regular'
              ? 'New regular schedule'
              : 'New exception'
        }
        submitLabel={isEdit ? 'Save changes' : 'Add schedule'}
        initial={initial}
        onSubmit={handleSubmit}
        onCancel={() => setEditor(null)}
      />
    );
  }

  function renderSection(group: Group) {
    const isRegular = group === 'regular';
    const rows = isRegular ? regular : exceptions;
    const headingId = `${group}-heading`;
    return (
      <section
        aria-labelledby={headingId}
        className="overflow-hidden rounded-xl border border-hairline bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <h3 id={headingId} className="font-semibold text-gray-900">
              {isRegular ? 'Regular hours' : 'Exceptions'}
            </h3>
            <span className="text-sm text-gray-600">
              {loading ? 'Loading…' : `${rows.length} schedules`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openEditor({ mode: 'create', group })}
            disabled={editor?.mode === 'create' && editor.group === group}
            className={SECONDARY_BUTTON}
          >
            {isRegular ? 'Add regular schedule' : 'Add exception'}
          </button>
        </div>
        {renderEditor(group)}
        {loading && schedules.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">Loading schedules…</p>
        ) : (
          <ScheduleTable
            schedules={rows}
            todayKey={todayKey}
            showType={!isRegular}
            emptyText={
              isRegular
                ? 'No regular schedule is saved yet.'
                : 'No exam periods, holidays or closures are saved.'
            }
            rowActions={rowActions}
          />
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="schedules-heading">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="schedules-heading" className="text-lg font-semibold text-gray-900">
            Operating schedules
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Regular hours apply by default. Exceptions such as exam periods and holidays override
            them on the dates they cover; the highest priority wins. Two schedules of the same type
            cannot overlap.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="self-start rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 sm:self-auto"
        >
          Refresh
        </button>
      </header>

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

      <p role="status" className={notice ? 'mb-4 text-sm font-medium text-emerald-700' : 'sr-only'}>
        {notice}
      </p>

      <div
        aria-live="polite"
        className="mb-4 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm"
      >
        {active ? (
          <TodayBanner active={active} />
        ) : (
          <p className="text-sm text-gray-500">Checking today&rsquo;s hours…</p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {renderSection('regular')}
        {renderSection('exception')}
      </div>
    </section>
  );
}
