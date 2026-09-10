'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { buildFloorPlan, fetchLayout } from './client';
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
  /** Layout failed to load AND no sample data could be served (should be rare). */
  isError: boolean;
  error: unknown;
  /** True while a background refresh is in flight. */
  isRefreshing: boolean;
  /** 'mock' when the feed fell back to bundled sample data. */
  source: 'api' | 'mock' | undefined;
  /** Force an immediate refresh. */
  refresh: () => void;
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
    isLoading: !res.data && !res.error,
    isError: Boolean(res.error) && !res.data,
    error: res.error,
    isRefreshing: res.isValidating,
    source: plan?.source,
    refresh: () => void res.mutate(),
  };
}
