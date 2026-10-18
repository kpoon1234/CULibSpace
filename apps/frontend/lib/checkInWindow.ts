// Resolves the check-in window the backend actually enforces in
// BookingService.checkIn() (apps/backend/src/services/bookingService.ts), which
// reads SystemConfig.earlyCheckInMinutes / lateThresholdMinutes and falls back
// to 15/15 when that row is unreadable.
//
// - earlyMinutes is derived from the booking's own `cancellation.deadline`,
//   which getActiveBooking() computes as startDateTime − earlyCheckInMinutes
//   from the real SystemConfig row, so it tracks the DB without a new endpoint.
// - lateMinutes is not exposed by any endpoint; it is 15 in SystemConfig today,
//   so it stays a constant here.
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
}): CheckInWindow {
  const startMs = Date.parse(booking.startDateTime);
  const deadlineMs = booking.cancellation?.deadline
    ? Date.parse(booking.cancellation.deadline)
    : NaN;
  const derivedEarly = (startMs - deadlineMs) / 60_000;

  return {
    earlyMinutes:
      Number.isFinite(derivedEarly) && derivedEarly >= 0
        ? derivedEarly
        : DEFAULT_CHECK_IN_WINDOW.earlyMinutes,
    lateMinutes: DEFAULT_CHECK_IN_WINDOW.lateMinutes,
  };
}
