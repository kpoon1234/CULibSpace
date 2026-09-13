'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { getAuthToken } from '@/lib/auth';
import { fetchActiveBooking, checkInBooking, type ActiveBookingData } from '@/lib/bookings';
import { ClockIcon, SeatIcon, PlugIcon, ScreenIcon, QrCodeIcon, CheckIcon } from './icons';

interface ActiveBookingCardProps {
  initialData?: ActiveBookingData | null;
}

function formatTimeslot(startStr: string, endStr: string) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 'Timeslot unavailable';
  }

  const now = new Date();
  const isToday =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();

  const isTomorrow =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate() + 1;

  const dateLabel = isToday
    ? 'Today'
    : isTomorrow
      ? 'Tomorrow'
      : start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  const startTime = start.toLocaleTimeString([], timeFormat);
  const endTime = end.toLocaleTimeString([], timeFormat);

  return `${dateLabel}, ${startTime} – ${endTime}`;
}

function getZoneLabel(zoneType?: string) {
  switch (zoneType) {
    case 'SILENT':
      return 'Silent Zone';
    case 'GROUP':
      return 'Group Study';
    case 'COMMON':
      return 'Common Area';
    default:
      return 'Library Zone';
  }
}

export default function ActiveBookingCard({ initialData }: ActiveBookingCardProps) {
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState<{ ok?: boolean; message?: string } | null>(
    null
  );

  const token = typeof window !== 'undefined' ? getAuthToken() : null;

  const { data: booking, mutate } = useSWR(
    token ? ['activeBooking', token] : null,
    () => fetchActiveBooking(),
    {
      fallbackData: initialData ?? undefined,
      refreshInterval: 15_000,
      revalidateOnFocus: true,
    }
  );

  // If no token or no active booking returned from /api/bookings/my-active, return null
  if (!token || !booking) {
    return null;
  }

  const { table, startDateTime, endDateTime, status, bookingId } = booking;
  const isCheckedIn = status === 'ACTIVE';

  async function handleCheckIn() {
    setIsCheckingIn(true);
    setCheckInStatus(null);
    try {
      const res = await checkInBooking(bookingId);
      if (res.ok) {
        setCheckInStatus({ ok: true, message: 'Check-in successful! Your seat is now active.' });
        mutate();
        setTimeout(() => {
          setIsQrModalOpen(false);
          setCheckInStatus(null);
        }, 1500);
      } else {
        setCheckInStatus({
          ok: false,
          message:
            res.reason || 'Check-in failed. Please ensure you are within the check-in window.',
        });
      }
    } catch {
      setCheckInStatus({ ok: false, message: 'Unable to connect to check-in server.' });
    } finally {
      setIsCheckingIn(false);
    }
  }

  return (
    <>
      <div className="mt-3 w-full max-w-[500px] overflow-hidden rounded-xl border border-hairline bg-white/95 p-4 shadow-sm backdrop-blur-sm transition-all hover:shadow-md sm:p-5">
        {/* Top bar: Status & Zone */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isCheckedIn
                  ? 'bg-spruce/10 text-spruce'
                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isCheckedIn ? 'bg-spruce' : 'animate-pulse bg-amber-500'
                }`}
              />
              {isCheckedIn ? 'Checked In' : 'Pending Check-in'}
            </span>
            <span className="text-xs font-medium text-gray-500">
              {getZoneLabel(table?.zone?.zoneType)}
            </span>
          </div>

          <span className="text-xs font-semibold text-gray-400">Booking #{bookingId}</span>
        </div>

        {/* Middle row: Table Name & Timeslot */}
        <div className="my-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 sm:text-xl">Table #{table?.tableId}</h3>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <ClockIcon className="h-3.5 w-3.5 text-cta-primary" />
              <span>{formatTimeslot(startDateTime, endDateTime)}</span>
            </div>
          </div>

          {/* Amenities Pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <span
              title={`${table?.numberOfSeat} Seats`}
              className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-700"
            >
              <SeatIcon className="h-3 w-3 text-stone-500" />
              <span>{table?.numberOfSeat} Seats</span>
            </span>

            {table?.plugCap !== null && table?.plugCap !== undefined && table.plugCap > 0 && (
              <span
                title={`${table.plugCap} Outlets`}
                className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-700"
              >
                <PlugIcon className="h-3 w-3 text-stone-500" />
                <span>{table.plugCap} Plugs</span>
              </span>
            )}

            {table?.hasTvScreen && (
              <span
                title="TV Screen Available"
                className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-700"
              >
                <ScreenIcon className="h-3 w-3 text-stone-500" />
                <span>Screen</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-3 pt-2">
          {isCheckedIn ? (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-spruce/10 py-2.5 text-xs font-medium text-spruce">
              <CheckIcon className="h-4 w-4" />
              <span>Currently in use — Enjoy your study session!</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-cta-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2"
            >
              <QrCodeIcon className="h-4 w-4 transition-transform group-hover:scale-110" />
              <span>Scan Table QR to Check-in</span>
            </button>
          )}
        </div>
      </div>

      {/* QR Check-in Modal */}
      {isQrModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsQrModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative flex w-full max-w-sm flex-col items-center overflow-hidden rounded-2xl bg-white p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close modal"
            >
              ✕
            </button>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-cta-primary">
              <QrCodeIcon className="h-6 w-6" />
            </div>

            <h3 className="mt-3 text-lg font-bold text-gray-900">Scan Table QR Code</h3>
            <p className="mt-1 text-xs text-gray-500">
              Locate the QR code on{' '}
              <strong className="text-gray-800">Table #{table?.tableId}</strong> to verify your
              on-site presence.
            </p>

            {/* QR Scanner Placeholder Box */}
            <div className="relative my-4 flex h-48 w-48 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-cta-primary/40 bg-gray-50 p-4">
              <div className="absolute inset-4 rounded-lg border border-cta-primary/20" />
              <div className="flex flex-col items-center gap-2">
                <QrCodeIcon className="h-16 w-16 text-gray-300" />
                <span className="text-[11px] text-gray-400 font-medium">
                  Align QR code within frame
                </span>
              </div>
            </div>

            {checkInStatus && (
              <div
                className={`mb-3 w-full rounded-md p-2.5 text-xs font-medium ${
                  checkInStatus.ok
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {checkInStatus.message}
              </div>
            )}

            <button
              type="button"
              disabled={isCheckingIn}
              onClick={handleCheckIn}
              className="w-full rounded-lg bg-cta-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cta-primary-hover disabled:opacity-50"
            >
              {isCheckingIn ? 'Verifying QR Code...' : 'Simulate Scan & Check-in'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
