// Mirrors the check-in window the backend actually enforces in
// BookingService.checkIn() (apps/backend/src/services/bookingService.ts) —
// it reads SystemConfig.earlyCheckInMinutes / lateThresholdMinutes and falls
// back to 15/15 when that row is unreadable.
//
// These are duplicated here rather than fetched because nothing in the app
// writes SystemConfig (only prisma/seed.ts does), so the value cannot drift at
// runtime today. If an admin screen ever gains the ability to edit it, extend
// /api/system-config/booking-limits with these two fields and feed them in
// through CountdownTimer's props — the timer takes them as arguments precisely
// so that swap stays a one-line change.

export const CHECK_IN_WINDOW = {
  /** How long before startDateTime check-in opens. */
  earlyMinutes: 15,
  /** How long after startDateTime check-in stays open before NO_SHOW. */
  lateMinutes: 15,
} as const;
