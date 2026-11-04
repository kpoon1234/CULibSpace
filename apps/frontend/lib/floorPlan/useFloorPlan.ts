'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { buildFloorPlan, fetchLayout } from './client';
import { findReopenDay, isLibraryClosedError, layoutRetryDelay } from './closure';
import type { LayoutRequestError } from './closure';
import { useBookingLimits } from '@/lib/systemConfig';
import { filterAmenityQuery, filterTimeRange } from './filterOptions';
import type { FloorPlan, FloorPlanFilter, LayoutQuery } from './types';
import { EMPTY_FILTER } from './types';

// One SWR resource: GET /api/tables/layout, polled on STATUS_POLL_MS for fresh status.
// Geometry + status are split out of that one response by fetchLayout(), then
// merged for render by buildFloorPlan().

export const STATUS_POLL_MS = 20_000;

export interface UseFloorPlanOptions {
  filter?: FloorPlanFilter;
  /** Override the status poll interval; 0 disables polling. */
  pollMs?: number;
  /**
   * Send the amenity filter (plugCap / hasTvScreen / minSeats) to the backend so
   * it pre-filters the rows. Default false: the map fetches every table and dims
   * the non-matching ones instead (so the plan still shows where each table is).
   */
  serverFilter?: boolean;
}

export interface UseFloorPlanResult {
  plan: FloorPlan | undefined;
  isLoading: boolean;
  /** Layout failed to load (network or server error) — no data to render. */
  isError: boolean;
  /**
   * A refresh (poll or manual retry) failed after a plan was already showing.
   * `keepPreviousData` keeps `plan` populated through this, so `isError` alone
   * never catches it — surface it separately instead of leaving the failure silent.
   */
  isStale: boolean;
  error: unknown;
  /**
   * The chosen window falls on a closed day (LIBRARY_CLOSED). Set even while
   * `keepPreviousData` still holds the last plan, and never counted as stale.
   */
  closedError: LayoutRequestError | null;
  /** True while a background refresh is in flight. */
  isRefreshing: boolean;
  /** The library is closed today; tables are shown as Closed. */
  libraryClosed: boolean;
  /** 'mock' when the feed fell back to bundled sample data. */
  source: 'api' | 'mock' | undefined;
  /** Force an immediate refresh. */
  refresh: () => void;
}

/** Load flags for a layout response; `data` may be the previous key's (keepPreviousData). */
export function layoutLoadState(
  data: unknown,
  error: unknown
): Pick<UseFloorPlanResult, 'isLoading' | 'isError' | 'isStale' | 'closedError'> {
  const closedError = isLibraryClosedError(error) ? error : null;
  return {
    isLoading: !data && !error,
    isError: Boolean(error) && !data,
    isStale: Boolean(error) && Boolean(data) && !closedError,
    closedError,
  };
}

export function useFloorPlan(
  floorId: number,
  { filter = EMPTY_FILTER, pollMs = STATUS_POLL_MS, serverFilter = false }: UseFloorPlanOptions = {}
): UseFloorPlanResult {
  // A fresh object each render is fine: SWR hashes the key by content, so an
  // identical query resolves to the same cache entry and doesn't refetch.
  const query: LayoutQuery = {
    floorId,
    ...filterTimeRange(filter),
    ...(serverFilter ? filterAmenityQuery(filter) : {}),
  };

  const res = useSWR(['floorPlan', query], ([, q]) => fetchLayout(q), {
    refreshInterval: pollMs || undefined,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    keepPreviousData: true,
    onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
      const delay = layoutRetryDelay(error, retryCount, pollMs);
      if (delay !== null) setTimeout(() => void revalidate({ retryCount }), delay);
    },
  });

  const plan = useMemo<FloorPlan | undefined>(() => {
    if (!res.data) return undefined;
    return buildFloorPlan({
      geometry: res.data.data.geometry,
      status: res.data.data.status,
      source: res.data.source,
      filter,
    });
  }, [res.data, filter]);

  return {
    plan,
    ...layoutLoadState(res.data, res.error),
    error: res.error,
    isRefreshing: res.isValidating,
    libraryClosed: res.data?.data.libraryClosed ?? false,
    source: plan?.source,
    refresh: () => void res.mutate(),
  };
}

/**
 * The day the library reopens after a closure on `closedKey`: a "YYYY-MM-DD"
 * key, null when it is closed as far ahead as bookings reach, undefined while
 * checking. Pass null to skip.
 */
export function useReopenDay(closedKey: string | null): string | null | undefined {
  const { maxAdvanceBookingDays } = useBookingLimits();
  const { data } = useSWR(
    closedKey ? ['reopenDay', closedKey, maxAdvanceBookingDays] : null,
    ([, key, days]) =>
      findReopenDay(key as string, days as number, (window) => fetchLayout(window)),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return data;
}
