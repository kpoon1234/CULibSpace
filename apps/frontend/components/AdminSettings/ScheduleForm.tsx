'use client';

import { useId, useState } from 'react';
import {
  AdminRequestError,
  MAX_SCHEDULE_NAME_LENGTH,
  PRIORITY_OPTIONS,
  errorMessage,
  payloadFromDraft,
  priorityLabel,
  validateScheduleDraft,
} from '@/lib/adminSettings';
import type {
  HoursMode,
  ScheduleDraft,
  ScheduleDraftErrors,
  SchedulePayload,
} from '@/lib/adminSettings';

const HOURS_OPTIONS: { value: HoursMode; label: string }[] = [
  { value: 'standard', label: 'Set hours' },
  { value: '24h', label: 'Open 24 hours' },
  { value: 'closed', label: 'Closed' },
];

const INPUT =
  'mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:bg-gray-50';

function inputClass(error?: string): string {
  return `${INPUT} ${error ? 'border-red-400' : 'border-gray-300'}`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-700">
      {message}
    </p>
  );
}

export function ScheduleForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: ScheduleDraft;
  submitLabel: string;
  onSubmit: (payload: SchedulePayload) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<ScheduleDraftErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Keep a priority the backend allows but the select doesn't list (e.g. 4) choosable.
  const priorities = PRIORITY_OPTIONS.includes(initial.priority as 1 | 2 | 3)
    ? [...PRIORITY_OPTIONS]
    : [...PRIORITY_OPTIONS, initial.priority];

  function set<K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validateScheduleDraft(draft);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await onSubmit(payloadFromDraft(draft));
    } catch (error) {
      setServerError(
        error instanceof AdminRequestError && error.code === 'SCHEDULE_CONFLICT'
          ? `${error.message}. Change the dates or the type so they don't overlap.`
          : errorMessage(error, 'Could not save the schedule.')
      );
      setSaving(false);
    }
  }

  const err = (key: keyof ScheduleDraft) => `${id}-${key}-error`;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="border-b border-gray-200 bg-stone-50 px-4 py-5 sm:px-5"
    >
      <h4 id={`${id}-title`} className="font-semibold text-gray-900">
        {title}
      </h4>

      {serverError && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {serverError}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
          Name
          <input
            type="text"
            value={draft.name}
            maxLength={MAX_SCHEDULE_NAME_LENGTH}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Midterm exams 2/2569"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? err('name') : undefined}
            disabled={saving}
            className={inputClass(errors.name)}
          />
          <FieldError id={err('name')} message={errors.name} />
        </label>

        <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
          Type
          <select
            value={draft.priority}
            onChange={(e) => set('priority', Number(e.target.value))}
            disabled={saving}
            className={inputClass()}
          >
            {priorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)} (priority {p})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Start date
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            aria-invalid={Boolean(errors.startDate)}
            aria-describedby={errors.startDate ? err('startDate') : undefined}
            disabled={saving}
            className={inputClass(errors.startDate)}
          />
          <FieldError id={err('startDate')} message={errors.startDate} />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          End date
          <input
            type="date"
            value={draft.endDate}
            min={draft.startDate || undefined}
            onChange={(e) => set('endDate', e.target.value)}
            aria-invalid={Boolean(errors.endDate)}
            aria-describedby={errors.endDate ? err('endDate') : undefined}
            disabled={saving}
            className={inputClass(errors.endDate)}
          />
          <FieldError id={err('endDate')} message={errors.endDate} />
        </label>

        <fieldset className="sm:col-span-2" disabled={saving}>
          <legend className="text-sm font-medium text-gray-700">Hours</legend>
          <div className="mt-1 inline-flex rounded-md border border-gray-300 bg-white p-0.5">
            {HOURS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded px-3 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rose-500 ${
                  draft.hoursMode === option.value
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-hours`}
                  value={option.value}
                  checked={draft.hoursMode === option.value}
                  onChange={() => set('hoursMode', option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {draft.hoursMode === 'standard' && (
          <>
            <label className="block text-sm font-medium text-gray-700">
              Opens
              <input
                type="time"
                value={draft.openTime}
                onChange={(e) => set('openTime', e.target.value)}
                aria-invalid={Boolean(errors.openTime)}
                aria-describedby={errors.openTime ? err('openTime') : undefined}
                disabled={saving}
                className={inputClass(errors.openTime)}
              />
              <FieldError id={err('openTime')} message={errors.openTime} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Closes
              <input
                type="time"
                value={draft.closeTime}
                onChange={(e) => set('closeTime', e.target.value)}
                aria-invalid={Boolean(errors.closeTime)}
                aria-describedby={errors.closeTime ? err('closeTime') : undefined}
                disabled={saving}
                className={inputClass(errors.closeTime)}
              />
              <FieldError id={err('closeTime')} message={errors.closeTime} />
            </label>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
