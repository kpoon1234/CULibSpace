// Resolves the check-in window the backend actually enforces in
// BookingService.checkIn() (apps/backend/src/services/bookingService.ts), which
// reads SystemConfig.earlyCheckInMinutes / lateThresholdMinutes and falls back
// to 15/15 when that row is unreadable.
//
// getActiveBooking() includes both limits from the SystemConfig row. Older API
// responses can still derive earlyMinutes from the cancellation deadline; if
// the config is unavailable, the backend also falls back to 15/15.
//
// Either way the backend stays authoritative: a check-in outside the real window
// is rejected with CHECK_IN_TOO_EARLY / CHECK_IN_TOO_LATE whatever this shows.

export const DEFAULT_CHECK_IN_WINDOW = {
  /** How long before startDateTime check-in opens. */
  earlyMinutes: 15,
  /** How long after startDateTime check-in stays open before NO_SHOW. */
  lateMinutes: 15,
} as const;

export interface CheckInWindow {
  earlyMinutes: number;
  lateMinutes: number;
}

export function resolveCheckInWindow(booking: {
  startDateTime: string;
  cancellation?: { deadline?: string };
  checkInWindow?: { earlyMinutes: number; lateMinutes: number };
}): CheckInWindow {
  const startMs = Date.parse(booking.startDateTime);
  const deadlineMs = booking.cancellation?.deadline
    ? Date.parse(booking.cancellation.deadline)
    : NaN;
  const derivedEarly = (startMs - deadlineMs) / 60_000;
  const apiEarly = booking.checkInWindow?.earlyMinutes;
  const apiLate = booking.checkInWindow?.lateMinutes;

  let earlyMinutes: number = DEFAULT_CHECK_IN_WINDOW.earlyMinutes;
  if (Number.isFinite(derivedEarly) && derivedEarly >= 0) earlyMinutes = derivedEarly;
  if (typeof apiEarly === 'number' && Number.isFinite(apiEarly) && apiEarly >= 0) {
    earlyMinutes = apiEarly;
  }

  return {
    earlyMinutes,
    lateMinutes:
      typeof apiLate === 'number' && Number.isFinite(apiLate) && apiLate >= 0
        ? apiLate
        : DEFAULT_CHECK_IN_WINDOW.lateMinutes,
  };
}
