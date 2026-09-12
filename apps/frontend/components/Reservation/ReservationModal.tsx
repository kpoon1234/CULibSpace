'use client';

import { useState, FormEvent } from 'react';
import { TIME_SLOTS } from '@/lib/floorPlan'; // Assuming this is an array of time strings, e.g., ['08:00', '09:00', ...]
import { createBooking } from '@/lib/bookings';

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: number;
  tableCode: string;
  tableZone: string;
  /** Defaults the date picker; the user can move it forward from here. */
  initialDate: Date;
  onConfirm: (startTime: string, endTime: string) => void;
}

type Step = 'form' | 'success' | 'fail';

// Mirrors SystemConfig.maxAdvanceBookingDays' default (7). The backend is the
// real source of truth and will reject anything further out regardless — this
// just keeps the date picker from offering choices that would always fail.
const MAX_ADVANCE_DAYS = 7;

function combineDateAndTime(date: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

/** Date -> the "YYYY-MM-DD" an <input type="date"> needs, in local time. */
function toDateInputValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** "12 October 2026" — day-month-year, spelled out. */
function formatDateLabel(d: Date): string {
  return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

export default function ReservationModal({
  isOpen,
  onClose,
  tableId,
  tableCode,
  tableZone,
  initialDate,
  onConfirm,
}: ReservationModalProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(TIME_SLOTS[0] || '');
  const [endTime, setEndTime] = useState(TIME_SLOTS[1] || '');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  // Lazy initializer: React guarantees this runs once at mount, so it's the
  // sanctioned place for a one-time impure Date.now() read (calling it inline
  // during render trips react-hooks/purity).
  const [maxDate] = useState(() => new Date(Date.now() + MAX_ADVANCE_DAYS * 86_400_000));

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Time validation check
    if (startTime >= endTime) {
      setError('End time must be after start time.');
      return;
    }

    setSubmitting(true);
    const result = await createBooking({
      tableId,
      startDateTime: combineDateAndTime(selectedDate, startTime).toISOString(),
      endDateTime: combineDateAndTime(selectedDate, endTime).toISOString(),
    });
    setSubmitting(false);

    if (result.ok) {
      onConfirm(startTime, endTime);
      setStep('success');
    } else {
      setDenyReason(result.reason || 'the reservation could not be validated.');
      setStep('fail');
    }
  };

  const handleClose = () => {
    onClose();
    setStep('form');
    setError(null);
  };

  const handleTryAgain = () => {
    setStep('form');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Modal Container */}
      <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {step === 'success' ? (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-gray-900">Reservation Successful</h2>
            <p className="mt-2 text-sm text-gray-500">
              Your table reservation on {formatDateLabel(selectedDate)} from {startTime} to{' '}
              {endTime} has been successfully processed.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-8 w-full rounded-full bg-emerald-400 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
            >
              Back to main menu
            </button>
          </div>
        ) : step === 'fail' ? (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 shadow-md">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-gray-900">Reservation Fail</h2>
            <p className="mt-2 text-sm text-gray-500">
              Your table reservation on {formatDateLabel(selectedDate)} from {startTime} to{' '}
              {endTime} was denied because {denyReason}
            </p>
            <button
              type="button"
              onClick={handleTryAgain}
              className="mt-8 w-full rounded-full bg-rose-400 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-medium text-gray-900 mb-1">Reserve a table</h2>
              <p className="text-sm text-gray-500">
                Table {tableCode} : {tableZone}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Date Field */}
              <div>
                <label className="block text-sm text-gray-500 mb-1.5 ml-1">Date</label>
                <input
                  type="date"
                  value={toDateInputValue(selectedDate)}
                  min={toDateInputValue(new Date())}
                  max={toDateInputValue(maxDate)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    setSelectedDate(new Date(y, m - 1, d));
                    setError(null);
                  }}
                  className="w-full rounded-xl bg-gray-200 px-4 py-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-400"
                  required
                />
              </div>

              {/* Time Slots */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5 ml-1">Start time</label>
                  <select
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      setError(null);
                    }}
                    className="w-full rounded-xl bg-[#e2e2e2] px-4 py-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-400 appearance-none"
                    required
                  >
                    {TIME_SLOTS.map((time) => (
                      <option key={`start-${time}`} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5 ml-1">End time</label>
                  <select
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      setError(null);
                    }}
                    className="w-full rounded-xl bg-gray-200 px-4 py-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-400 appearance-none"
                    required
                  >
                    {TIME_SLOTS.map((time) => (
                      <option key={`end-${time}`} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Error Message */}
              {error && <p className="text-xs font-medium text-red-500 ml-1">{error}</p>}

              {/* Action Buttons */}
              <div className="mt-8 flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-full border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-chula-pink px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-chula-pink-hover focus:outline-none focus:ring-2 focus:ring-chula-pink focus:ring-offset-2 disabled:opacity-60"
                >
                  {submitting ? 'Checking…' : 'Confirm Reservation'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
