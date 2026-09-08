import { API_URL } from '@/lib/auth';
import { tablePassesFilter } from './filterOptions';
import { mockFloorLayout, mockSeatStatus } from './mockData';
import type {
  FloorLayoutResponse,
  FloorPlan,
  FloorPlanFilter,
  FloorPlanTable,
  FloorPlanZone,
  SeatLayoutEnvelope,
  SeatLayoutQuery,
  SeatStatusZone,
  TableStatus,
  ZoneType,
} from './types';
import { TABLE_STATUSES } from './types';

// Data access for the floor-plan UI. Two endpoints:
//
//   GET /api/floors/:floorId/layout   -> FloorLayoutResponse   (NOT built yet)
//   GET /api/seats/layout?<query>     -> SeatLayoutEnvelope     (seatAPI branch)
//
// Both fall back to bundled sample data on any network/parse error so the UI is
// demoable before either lands. Every fetcher reports whether it served real or
// mock data via the `source` field it threads through to FloorPlan.source.

const LAYOUT_PATH = (floorId: number) => `${API_URL}/api/floors/${floorId}/layout`;
const SEAT_LAYOUT_PATH = `${API_URL}/api/seats/layout`;

/** Set NEXT_PUBLIC_FLOORPLAN_MOCK=1 to skip the network entirely (Storybook, CI, offline demo). */
const FORCE_MOCK = process.env.NEXT_PUBLIC_FLOORPLAN_MOCK === '1';

export interface Sourced<T> {
  data: T;
  source: 'api' | 'mock';
}

// ---------------------------------------------------------------------------
// 1. Floor layout & zone metadata
// ---------------------------------------------------------------------------

export async function fetchFloorLayout(
  floorId: number,
  signal?: AbortSignal
): Promise<Sourced<FloorLayoutResponse>> {
  if (FORCE_MOCK) return { data: mockFloorLayout(floorId), source: 'mock' };

  try {
    const res = await fetch(LAYOUT_PATH(floorId), {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`layout ${res.status}`);
    const body = (await res.json()) as FloorLayoutResponse | { data: FloorLayoutResponse };
    // Tolerate either a bare object or a { data } envelope.
    const data = 'floor' in body ? body : (body as { data: FloorLayoutResponse }).data;
    if (!data?.floor || !Array.isArray(data.zones)) throw new Error('layout: malformed payload');
    return { data, source: 'api' };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[floorPlan] layout API unavailable, using sample layout:',
        (err as Error).message
      );
    }
    return { data: mockFloorLayout(floorId), source: 'mock' };
  }
}

// ---------------------------------------------------------------------------
// 2. Live seat status
// ---------------------------------------------------------------------------

function toQueryString(q: SeatLayoutQuery): string {
  const p = new URLSearchParams();
  if (q.zoneType) p.set('zoneType', q.zoneType);
  if (q.plugCap != null) p.set('plugCap', String(q.plugCap));
  if (q.hasTvScreen != null) p.set('hasTvScreen', String(q.hasTvScreen));
  if (q.date) p.set('date', q.date);
  if (q.timeSlot) p.set('timeSlot', q.timeSlot);
  if (q.startDateTime) p.set('startDateTime', q.startDateTime);
  if (q.endDateTime) p.set('endDateTime', q.endDateTime);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function fetchSeatStatus(
  floorId: number,
  query: SeatLayoutQuery = {},
  signal?: AbortSignal
): Promise<Sourced<SeatStatusZone[]>> {
  if (FORCE_MOCK) return { data: mockSeatStatus(floorId), source: 'mock' };

  try {
    const res = await fetch(`${SEAT_LAYOUT_PATH}${toQueryString(query)}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`seats ${res.status}`);
    const body = (await res.json()) as SeatLayoutEnvelope;
    if (!body.success || !Array.isArray(body.data)) {
      throw new Error(body.error || 'seats: unsuccessful response');
    }
    return { data: body.data, source: 'api' };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[floorPlan] seat-status API unavailable, using sample status:',
        (err as Error).message
      );
    }
    return { data: mockSeatStatus(floorId), source: 'mock' };
  }
}

// ---------------------------------------------------------------------------
// Merge — geometry + live status -> render model
// ---------------------------------------------------------------------------

function emptyCounts(): Record<TableStatus, number> {
  const counts = {} as Record<TableStatus, number>;
  for (const s of TABLE_STATUSES) counts[s] = 0;
  return counts;
}

export interface BuildFloorPlanArgs {
  layout: FloorLayoutResponse;
  status: SeatStatusZone[];
  source: 'api' | 'mock';
  /** Client-side amenity filter; matched tables are flagged, not dropped. */
  filter?: FloorPlanFilter;
}

/**
 * Joins the static layout with the live-status feed by tableId. Tables missing
 * from the status feed default to Available so the plan never renders blank.
 */
export function buildFloorPlan({ layout, status, source, filter }: BuildFloorPlanArgs): FloorPlan {
  const statusByTableId = new Map<number, SeatStatusZone['tables'][number]>();
  for (const zone of status) {
    for (const t of zone.tables) statusByTableId.set(t.tableId, t);
  }

  const zones: FloorPlanZone[] = layout.zones.map((zone) => {
    const counts = emptyCounts();
    const tables: FloorPlanTable[] = zone.tables.map((t) => {
      const live = statusByTableId.get(t.tableId);
      const tableStatus: TableStatus = live?.status ?? 'Available';
      counts[tableStatus] += 1;
      return {
        ...t,
        zoneId: zone.zoneId,
        zoneType: zone.zoneType,
        status: tableStatus,
        isLocked: live?.isLocked ?? false,
      };
    });

    return {
      zoneId: zone.zoneId,
      zoneType: zone.zoneType,
      label: zone.label,
      bounds: zone.bounds,
      tables: filter ? tables.filter((t) => tablePassesFilter(t, filter)) : tables,
      counts,
      total: zone.tables.length,
    };
  });

  return { floor: layout.floor, zones, source };
}

export function pickZone(plan: FloorPlan, zoneType: ZoneType): FloorPlanZone | undefined {
  return plan.zones.find((z) => z.zoneType === zoneType);
}
