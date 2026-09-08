'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { buildFloorPlan, fetchFloorLayout, fetchSeatStatus } from './client';
import { filterTimeRange } from './filterOptions';
import type { FloorPlan, FloorPlanFilter, SeatLayoutQuery } from './types';
import { EMPTY_FILTER } from './types';

// Two SWR resources with different cadences:
//   - layout: fetched once per floor, revalidated rarely (furniture rarely moves)
//   - status: polled on STATUS_POLL_MS (live availability)
// They are merged client-side by buildFloorPlan().

export const STATUS_POLL_MS = 20_000;

export interface UseFloorPlanOptions {
  filter?: FloorPlanFilter;
  /** Override the status poll interval; 0 disables polling. */
  pollMs?: number;
}

export interface UseFloorPlanResult {
  plan: FloorPlan | undefined;
  isLoading: boolean;
  /** Layout failed to load AND no sample data could be served (should be rare). */
  isError: boolean;
  error: unknown;
  /** True while a background status refresh is in flight. */
  isRefreshing: boolean;
  /** 'mock' when any feed fell back to bundled sample data. */
  source: 'api' | 'mock' | undefined;
  /** Force an immediate status refresh. */
  refresh: () => void;
}

export function useFloorPlan(
  floorId: number,
  { filter = EMPTY_FILTER, pollMs = STATUS_POLL_MS }: UseFloorPlanOptions = {}
): UseFloorPlanResult {
  const layout = useSWR(['floorPlan/layout', floorId], ([, id]) => fetchFloorLayout(id), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 60_000,
  });

  // Only the booking window feeds the status query; amenity filters (plugs, TV)
  // are applied client-side so the mock honours them too.
  const timeRange = filterTimeRange(filter);
  const statusQuery: SeatLayoutQuery = useMemo(
    () => (timeRange ? { ...timeRange } : {}),
    [timeRange?.startDateTime, timeRange?.endDateTime] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const status = useSWR(
    ['floorPlan/status', floorId, statusQuery.startDateTime ?? '', statusQuery.endDateTime ?? ''],
    ([, id]) => fetchSeatStatus(id, statusQuery),
    {
      refreshInterval: pollMs || undefined,
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
      keepPreviousData: true,
    }
  );

  const plan = useMemo<FloorPlan | undefined>(() => {
    if (!layout.data || !status.data) return undefined;
    return buildFloorPlan({
      layout: layout.data.data,
      status: status.data.data,
      source: layout.data.source === 'api' && status.data.source === 'api' ? 'api' : 'mock',
      filter,
    });
  }, [layout.data, status.data, filter]);

  return {
    plan,
    isLoading: !layout.data && !layout.error,
    isError: Boolean(layout.error) && !layout.data,
    error: layout.error ?? status.error,
    isRefreshing: status.isValidating,
    source: plan?.source,
    refresh: () => void status.mutate(),
  };
}
