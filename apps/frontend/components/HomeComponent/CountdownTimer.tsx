'use client';

import { useEffect, useRef } from 'react';
import { CHECK_IN_WINDOW } from '@/lib/checkInWindow';
import { formatHms, useCountdown } from '@/lib/useCountdown';
import type { ActiveBookingData } from '@/lib/bookings';

interface CountdownTimerProps {
  startDateTime: string;
  endDateTime: string;
  status: ActiveBookingData['status'];
  /** Called once when the window this timer tracks runs out, so the card can
   *  refetch instead of waiting for SWR's next poll — NoShowWorker only sweeps
   *  once a minute, so a stale card can otherwise linger well past expiry. */
  onExpire?: () => void;
  earlyMinutes?: number;
  lateMinutes?: number;
}

/** Colour per phase. Each phase pairs its colour with its own wording, because
 *  red alone cannot tell a colour-blind reader they are running late. */
const TONES = {
  countdown: { value: 'text-gray-900', label: 'text-gray-500' },
  late: { value: 'text-red-600', label: 'text-red-700' },
  session: { value: 'text-spruce', label: 'text-spruce/70' },
} as const;

/**
 * The check-in clock, and the card's centre of gravity: whoever opens this page
 * with a booking in hand is asking one question, and it is this number.
 *
 *   PENDING, more than earlyMinutes out → not rendered (check-in is not open)
 *   PENDING, within earlyMinutes        → counts down to startDateTime, ink
 *   PENDING, past startDateTime         → counts up for lateMinutes, scarlet
 *   PENDING, past the late threshold    → frozen at the cutoff, scarlet
 *   ACTIVE                              → counts down to endDateTime, spruce
 *
 * Every phase renders digits — a frozen clock keeps the card from reflowing at
 * the exact moment the user is reading it. The thresholds mirror
 * BookingService.checkIn(); see lib/checkInWindow.ts for why they live here.
 */
export default function CountdownTimer({
  startDateTime,
  endDateTime,
  status,
  onExpire,
  earlyMinutes = CHECK_IN_WINDOW.earlyMinutes,
  lateMinutes = CHECK_IN_WINDOW.lateMinutes,
}: CountdownTimerProps) {
  const isCheckedIn = status === 'ACTIVE';

  const startMs = Date.parse(startDateTime);
  const endMs = Date.parse(endDateTime);
  const targetMs = isCheckedIn ? endMs : startMs;

  const diff = useCountdown(Number.isNaN(targetMs) ? null : targetMs);

  const lateMs = lateMinutes * 60_000;
  const earlyMs = earlyMinutes * 60_000;

  const isFinished = diff !== null && (isCheckedIn ? diff <= 0 : diff <= -lateMs);

  // Fire on the edge into the finished state rather than on every render, so an
  // unmemoised callback from the parent cannot turn into a refetch loop. Reset
  // when it goes back, which a refetch to a later booking does.
  const hasFiredRef = useRef(false);
  useEffect(() => {
    if (!isFinished) {
      hasFiredRef.current = false;
      return;
    }
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    onExpire?.();
  }, [isFinished, onExpire]);

  // Pre-hydration: useCountdown withholds a value until it runs on the client,
  // and without one there is no way to know whether this belongs on screen at
  // all. Render nothing rather than a placeholder that may not belong.
  if (diff === null) return null;

  let tone: (typeof TONES)[keyof typeof TONES];
  let label: string;
  let seconds: number;

  if (isCheckedIn) {
    tone = TONES.session;
    label = isFinished ? 'Session ended' : 'Time remaining';
    seconds = isFinished ? 0 : Math.ceil(diff / 1000);
  } else if (diff > earlyMs) {
    // Check-in has not opened yet; a countdown here would only be noise.
    return null;
  } else if (diff > 0) {
    tone = TONES.countdown;
    label = 'Check in within';
    seconds = Math.ceil(diff / 1000);
  } else if (!isFinished) {
    tone = TONES.late;
    label = 'Late by';
    seconds = Math.floor(-diff / 1000);
  } else {
    tone = TONES.late;
    label = 'Check-in expired';
    seconds = Math.floor(lateMs / 1000);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-5 pb-5 sm:px-6 sm:py-6">
      {/* No border or fill: the card is already the raised surface, and a second
          framed box inside it would read as a card within a card. Colour and
          scale carry the state instead. */}
      <div role="timer" className="flex flex-col items-center gap-1">
        <span
          className={`font-mono text-4xl font-bold tracking-tight tabular-nums sm:text-5xl ${tone.value}`}
        >
          {formatHms(seconds)}
        </span>

        {/* role="timer" implies aria-live="off", so the digits never flood a
            screen reader. The caption opts back in and announces once per phase
            change — the part a user actually needs told. It also carries the
            meaning the digits cannot: 00:02:48 of what. */}
        <span
          aria-live="polite"
          className={`text-xs font-semibold tracking-wide uppercase ${tone.label}`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
