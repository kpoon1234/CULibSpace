'use client';

import { useState, FormEvent } from 'react';
import { TIME_SLOTS } from '@/lib/floorPlan'; // Assuming this is an array of time strings, e.g., ['08:00', '09:00', ...]

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableCode: string;
  tableZone: string;
  date: string; // e.g., "12 October 2026"
  onConfirm: (startTime: string, endTime: string) => void;
}

type Step = 'form' | 'result';

export default function ReservationModal({
  isOpen,
  onClose,
  tableCode,
  tableZone,
  date,
  onConfirm,
}: ReservationModalProps) {
  const [startTime, setStartTime] = useState(TIME_SLOTS[0] || '');
  const [endTime, setEndTime] = useState(TIME_SLOTS[1] || '');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Time validation check
    if (startTime >= endTime) {
      setError('End time must be after start time.');
      return;
    }

    onConfirm(startTime, endTime);
    setStep('result');
  };

  const handleClose = () => {
    onClose();
    setStep('form');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Modal Container */}
      <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {step === 'result' ? (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
              <svg
                className="h-7 w-7 text-rose-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <h2 className="mt-4 text-2xl font-medium text-gray-900">Reservation confirmed</h2>
            <p className="mt-1 text-sm text-gray-500">
              Table {tableCode} · {tableZone}
            </p>
            <p className="mt-4 text-sm text-gray-700">
              {date}, {startTime} – {endTime}
            </p>
            <p className="mt-4 text-xs text-gray-400">
              Preview only — reservations aren&apos;t saved yet.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-8 w-full rounded-full bg-chula-400 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2"
            >
              Done
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
              {/* Date Field (Read-only) */}
              <div>
                <label className="block text-sm text-gray-500 mb-1.5 ml-1">Date</label>
                <div className="relative">
                  <input
                    type="text"
                    value={date}
                    readOnly
                    className="w-full cursor-not-allowed rounded-xl bg-gray-200 px-4 py-3 pr-10 text-gray-600 focus:outline-none"
                  />
                  {/* Calendar Icon */}
                  <svg
                    className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white stroke-[2.5]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
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
                  className="rounded-full bg-chula-400 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2"
                >
                  Confirm Reservation
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
