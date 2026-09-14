'use client';

import { useState, useRef, useCallback } from 'react';
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

  // Ref to track the auto-close timeout so it can be cancelled if the modal is
  // closed early (e.g. user taps outside before 1500ms), preventing a setState
  // call on an already-hidden modal that would cause stale state or React warnings.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback-based close — clears any pending auto-close timer first
  const closeQrModal = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsQrModalOpen(false);
    setCheckInStatus(null);
  }, []);

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
        // Store timer ref so it can be cancelled if the user closes the modal
        // before 1500ms elapses — prevents setState on an already-hidden modal.
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          closeQrModal();
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
      <div className="relative mt-3 w-full max-w-full overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-br from-white via-white to-rose-50/40 shadow-md shadow-rose-950/5 backdrop-blur-sm transition-all hover:border-rose-300 hover:shadow-lg">
        {/* Top Accent Gradient Bar */}
        <div className="h-1 w-full bg-gradient-to-r from-cta-primary via-chula-pink to-rose-400" />

        <div className="flex flex-col sm:flex-row sm:items-stretch sm:justify-between">
          {/* Left Area: Details & Amenities */}
          <div className="flex flex-1 flex-col justify-between gap-4 p-5 sm:p-6">
            {/* Top row: Status, Zone & Booking ID */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold tracking-wide uppercase ${
                    isCheckedIn
                      ? 'bg-spruce/10 text-spruce ring-1 ring-spruce/30'
                      : 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/30'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isCheckedIn ? 'bg-spruce' : 'animate-pulse bg-amber-500'
                    }`}
                  />
                  {isCheckedIn ? 'Active Session' : 'Pending Check-in'}
                </span>

                <span className="rounded-md bg-stone-100/90 px-2.5 py-0.5 text-xs font-medium text-stone-700">
                  {getZoneLabel(table?.zone?.zoneType)}
                </span>
              </div>

              <span className="font-mono text-xs font-semibold text-gray-400">#BK-{bookingId}</span>
            </div>

            {/* Table Number & Time */}
            <div className="my-1">
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                  Table #{table?.tableId}
                </h3>
              </div>

              <div className="mt-1.5 inline-flex items-center gap-2 rounded-lg bg-white/80 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200/70 sm:text-sm">
                <ClockIcon className="h-4 w-4 text-cta-primary" />
                <span>{formatTimeslot(startDateTime, endDateTime)}</span>
              </div>
            </div>

            {/* Amenities Pills — only rendered when API returns a table object */}
            {table && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span
                  title={`${table.numberOfSeat} Seats`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-2xs"
                >
                  <SeatIcon className="h-3.5 w-3.5 text-stone-500" />
                  <span>{table.numberOfSeat ?? '—'} Seats</span>
                </span>

                {table.plugCap !== null && table.plugCap !== undefined && table.plugCap > 0 && (
                  <span
                    title={`${table.plugCap} Outlets`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-2xs"
                  >
                    <PlugIcon className="h-3.5 w-3.5 text-stone-500" />
                    <span>{table.plugCap} Plugs</span>
                  </span>
                )}

                {table.hasTvScreen && (
                  <span
                    title="TV Screen Available"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-2xs"
                  >
                    <ScreenIcon className="h-3.5 w-3.5 text-stone-500" />
                    <span>TV Screen</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Ticket Divider (Dashed on Desktop, Solid on Mobile) */}
          <div className="relative flex items-center justify-center sm:my-4 sm:flex-col">
            <div className="h-px w-full border-t border-dashed border-rose-200 sm:h-full sm:w-px sm:border-t-0 sm:border-r" />
          </div>

          {/* Right Area: Action / QR Check-in */}
          <div className="flex shrink-0 flex-col items-center justify-center p-5 sm:min-w-[160px] sm:p-6">
            {isCheckedIn ? (
              <div className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-spruce/20 bg-spruce/5 p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-spruce text-white shadow-sm">
                  <CheckIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-spruce">Checked In</div>
                  <div className="text-[11px] text-spruce/70">Seat Active</div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                aria-label="Scan Table QR to Check-in"
                className="group relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-cta-primary to-cta-primary-hover p-4 text-center text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 active:scale-95 sm:w-auto sm:min-w-[140px]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 shadow-inner transition-transform group-hover:scale-110">
                  <QrCodeIcon className="h-5 w-5 text-white" />
                </div>

                <div className="flex flex-col items-center leading-tight">
                  <span className="text-xs font-extrabold tracking-wide uppercase">
                    Scan Table QR
                  </span>
                  <span className="mt-0.5 text-[10px] text-white/80 font-medium">to Check-in</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Check-in Modal */}
      {isQrModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeQrModal();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative flex w-full max-w-sm flex-col items-center overflow-hidden rounded-2xl bg-white p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={closeQrModal}
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
