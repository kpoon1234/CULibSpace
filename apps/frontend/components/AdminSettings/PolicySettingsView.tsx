'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AdminRequestError,
  POLICY_FIELDS,
  POLICY_GROUPS,
  diffPolicyDraft,
  draftFromPolicy,
  errorMessage,
  fetchPolicy,
  updatePolicy,
} from '@/lib/adminSettings';
import type {
  BookingPolicy,
  PolicyDraft,
  PolicyDraftErrors,
  PolicyField,
} from '@/lib/adminSettings';

const KNOWN_FIELDS = new Set<string>(POLICY_FIELDS.map((spec) => spec.field));

export function PolicySettingsView() {
  const id = useId();
  const [saved, setSaved] = useState<BookingPolicy | null>(null);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [errors, setErrors] = useState<PolicyDraftErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const policy = await fetchPolicy(controller.signal);
      if (controller.signal.aborted) return;
      setSaved(policy);
      setDraft(draftFromPolicy(policy));
      setErrors({});
    } catch (err) {
      if (controller.signal.aborted) return;
      setLoadError(errorMessage(err, 'Could not load the booking policy.'));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial fetch on mount; load() sets state only after its request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const dirty =
    saved !== null &&
    draft !== null &&
    POLICY_FIELDS.some((spec) => draft[spec.field] !== draftFromPolicy(saved)[spec.field]);

  function setField(field: PolicyField, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!saved || !draft) return;
    setSaveError(null);
    setNotice(null);

    const { changes, errors: found } = diffPolicyDraft(draft, saved);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (Object.keys(changes).length === 0) {
      setNotice('Nothing to save.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updatePolicy(changes);
      setSaved(updated);
      setDraft(draftFromPolicy(updated));
      setNotice('Booking policy saved. New bookings follow these limits right away.');
    } catch (err) {
      if (err instanceof AdminRequestError && err.fieldErrors.length > 0) {
        const fromServer: PolicyDraftErrors = {};
        for (const fe of err.fieldErrors) {
          if (KNOWN_FIELDS.has(fe.field)) fromServer[fe.field as PolicyField] = fe.message;
        }
        setErrors(fromServer);
      }
      setSaveError(errorMessage(err, 'Could not save the booking policy.'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!saved) return;
    setDraft(draftFromPolicy(saved));
    setErrors({});
    setSaveError(null);
    setNotice(null);
  }

  return (
    <section aria-labelledby={`${id}-heading`}>
      <header className="mb-4">
        <h2 id={`${id}-heading`} className="text-lg font-semibold text-gray-900">
          Booking policy
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Limits every reservation and visitor ticket is checked against.
        </p>
      </header>

      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="overflow-hidden rounded-xl border border-hairline bg-white shadow-sm"
      >
        {!draft ? (
          <p className="p-8 text-center text-sm text-gray-500">
            {loading ? 'Loading booking policy…' : 'The booking policy is unavailable.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-200">
            {POLICY_GROUPS.map((group, index) => (
              <div
                key={group.title}
                role="group"
                aria-labelledby={`${id}-group-${index}`}
                className="grid gap-x-6 gap-y-4 px-4 py-5 sm:px-5 md:grid-cols-[180px_minmax(0,1fr)]"
              >
                <h3 id={`${id}-group-${index}`} className="text-sm font-semibold text-gray-900">
                  {group.title}
                </h3>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {group.fields.map((spec) => {
                    const inputId = `${id}-${spec.field}`;
                    const error = errors[spec.field];
                    const describedBy = `${inputId}-help${error ? ` ${inputId}-error` : ''}`;
                    return (
                      <div key={spec.field}>
                        <label
                          htmlFor={inputId}
                          className="block text-sm font-medium text-gray-700"
                        >
                          {spec.label}
                        </label>
                        <div
                          className={`mt-1 flex rounded-md border bg-white focus-within:ring-2 focus-within:ring-rose-500 ${
                            error ? 'border-red-400' : 'border-gray-300'
                          }`}
                        >
                          <input
                            id={inputId}
                            type="text"
                            inputMode={spec.inBaht ? 'decimal' : 'numeric'}
                            value={draft[spec.field]}
                            onChange={(e) => setField(spec.field, e.target.value)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={describedBy}
                            disabled={saving}
                            className="min-w-0 flex-1 rounded-l-md bg-transparent px-3 py-2 text-sm text-gray-900 tabular-nums focus:outline-none disabled:text-gray-500"
                          />
                          <span className="flex items-center rounded-r-md border-l border-gray-200 bg-gray-50 px-3 text-xs text-gray-600">
                            {spec.unit}
                          </span>
                        </div>
                        <p id={`${inputId}-help`} className="mt-1 text-xs text-gray-500">
                          {spec.help}
                        </p>
                        {error && (
                          <p id={`${inputId}-error`} className="mt-1 text-xs text-red-700">
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-h-5 text-sm">
            {saveError ? (
              <p role="alert" className="text-red-700">
                {saveError}
              </p>
            ) : (
              <p role="status" className="text-emerald-700">
                {notice}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={!dirty || saving}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
            >
              Discard changes
            </button>
            <button
              type="submit"
              disabled={!dirty || saving}
              className="rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saving ? 'Saving…' : 'Save policy'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
