'use client';

import { useEffect, useState } from 'react';

interface Sample {
  /** The target this diff was measured against, so a stale sample left over
   *  from a previous target can be discarded by derivation rather than by an
   *  extra state write inside the effect. */
  target: number;
  diff: number;
}

/**
 * Milliseconds remaining until `targetMs` — positive before the target,
 * negative after it — refreshed once per displayed second.
 *
 * Returns `null` until the effect has run on the client. `Date.now()` differs
 * between the server render and the client render, so emitting a real number on
 * the first pass would mismatch the prerendered markup and make React throw the
 * server HTML away. Callers render a placeholder while this is null (same class
 * of guard as the localStorage fix in 4cef7e8).
 *
 * The value is recomputed from the absolute target on every tick instead of
 * being decremented, because browsers throttle timers in a backgrounded tab to
 * roughly once a minute. A decrementing counter would silently lose those
 * seconds; recomputing means a throttled tab merely repaints less often and is
 * correct again the instant it becomes visible.
 *
 * Caveat: this reads the *client's* clock, while the server decides NO_SHOW
 * from its own. A user with a badly skewed system clock sees skewed digits —
 * the booking status itself stays server-authoritative, so only the display is
 * affected.
 */
export function useCountdown(targetMs: number | null, active = true): number | null {
  const [sample, setSample] = useState<Sample | null>(null);

  const enabled = targetMs !== null && Number.isFinite(targetMs) && active;

  useEffect(() => {
    if (!enabled || targetMs === null) return;

    const target = targetMs;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const next = target - Date.now();
      setSample({ target, diff: next });

      // Sleep until the rendered second actually changes rather than a flat
      // 1000ms, so digits flip on the true boundary instead of drifting further
      // out of step with every tick. Counting down renders Math.ceil, which
      // drops as the gap crosses each multiple of 1000; counting up renders
      // Math.floor, which rises at those same multiples from the other side.
      const delay = next > 0 ? next % 1000 || 1000 : 1000 - (-next % 1000);
      timer = setTimeout(tick, Math.max(delay, 16));
    };

    tick();

    // A throttled tab can be many seconds stale. Resync on return so the first
    // paint after the user comes back is already right, rather than showing a
    // stale value until the next scheduled tick lands.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer !== null) clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, targetMs]);

  if (!enabled || sample === null || sample.target !== targetMs) return null;
  return sample.diff;
}

/** Whole seconds as hh:mm:ss. Hours are not clamped at 24 — a long gap simply
 *  renders more hour digits rather than silently wrapping. */
export function formatHms(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}
