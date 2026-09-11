import { API_URL } from '@/lib/auth';
import { synthesizeLayout } from './autoLayout';
import { tablePassesFilter } from './filterOptions';
import { mockFloorLayout, mockSeatStatus } from './mockData';
import type {
  FloorLayoutResponse,
  FloorPlan,
  FloorPlanFilter,
  FloorPlanTable,
  FloorPlanZone,
  LayoutEnvelope,
  LayoutQuery,
  RawLayoutZone,
  SeatStatusZone,
  TableStatus,
  ZoneType,
} from './types';
import { TABLE_STATUSES } from './types';

// Data access for the floor-plan UI. One backend endpoint (LayoutController):
//
//   GET /api/tables/layout?<query>  ->  { success, data: RawLayoutZone[] }
//
// Each zone lists its tables with a live `status` (computed for the requested
// time window) plus attributes. Geometry (x/y/shape/size, zone bounds) is
// optional — synthesizeLayout() fills any gaps so the map always renders. A
// network/server/parse failure REJECTS (no silent mock fallback) so the UI can
// show FloorPlanError + a retry button. Bundled sample data is only served when
// NEXT_PUBLIC_FLOORPLAN_MOCK=1 is set explicitly (offline demo / Storybook).

const LAYOUT_PATH = process.env.NEXT_PUBLIC_FLOORPLAN_PATH || '/api/tables/layout';

/** Set NEXT_PUBLIC_FLOORPLAN_MOCK=1 to skip the network entirely (Storybook, CI, offline demo). */
const FORCE_MOCK = process.env.NEXT_PUBLIC_FLOORPLAN_MOCK === '1';

export interface Sourced<T> {
  data: T;
  source: 'api' | 'mock';
}

/** Geometry + live status, both derived from one /api/tables/layout response. */
export interface LayoutResult {
  geometry: FloorLayoutResponse;
  status: SeatStatusZone[];
}

// GET /api/tables/layout params, per LayoutController: zoneType, plugCap,
// hasTvScreen, minSeats, startDateTime, endDateTime. `floorId` is a UI-only hint
// (no floor concept in the backend) and is not sent.
function toQueryString(q: LayoutQuery): string {
  const p = new URLSearchParams();
  if (q.zoneType) p.set('zoneType', q.zoneType);
  if (q.plugCap != null) p.set('plugCap', String(q.plugCap));
  if (q.hasTvScreen != null) p.set('hasTvScreen', String(q.hasTvScreen));
  if (q.minSeats != null) p.set('minSeats', String(q.minSeats));
  if (q.startDateTime) p.set('startDateTime', q.startDateTime);
  if (q.endDateTime) p.set('endDateTime', q.endDateTime);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// The backend serialises Prisma enums by their MEMBER NAME, not the @map value —
// "SILENT" / "AVAILABLE", not "Silent" / "Available". Normalise to the canonical
// capitalised form the UI uses (also a no-op if the backend later switches to
// @map values).
function cap(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}
function normZoneType(v: string): ZoneType {
  return cap(v) as ZoneType;
}
function normStatus(v: string | undefined): TableStatus {
  return v ? (cap(v) as TableStatus) : 'Available';
}

/** Canonicalise enum casing in a raw payload before it fans out to
 *  synthesizeLayout() + toStatusFeed(). */
function normalizeRawZones(zones: RawLayoutZone[]): RawLayoutZone[] {
  return zones.map((z) => ({
    ...z,
    zoneType: normZoneType(z.zoneType),
    tables: z.tables.map((t) => ({ ...t, status: normStatus(t.status) })),
  }));
}

/** Split a raw /api/tables/layout payload into a status feed for buildFloorPlan(). */
function toStatusFeed(zones: RawLayoutZone[]): SeatStatusZone[] {
  return zones.map((z) => ({
    zoneId: z.zoneId,
    zoneType: z.zoneType,
    tables: z.tables.map((t) => ({
      tableId: t.tableId,
      zoneId: t.zoneId ?? z.zoneId,
      numberOfSeat: t.numberOfSeat,
      plugCap: t.plugCap ?? null,
      hasTvScreen: Boolean(t.hasTvScreen),
      status: t.status as TableStatus,
      isLocked: Boolean(t.isLocked),
    })),
  }));
}

function mockResult(floorId: number): LayoutResult {
  return { geometry: mockFloorLayout(floorId), status: mockSeatStatus(floorId) };
}

/**
 * Fetch GET /api/tables/layout and shape it for the UI. `query.floorId` is not
 * sent (no floor concept in the backend); it only picks the sample floor on
 * fallback.
 */
export async function fetchLayout(
  query: LayoutQuery = {},
  signal?: AbortSignal
): Promise<Sourced<LayoutResult>> {
  const floorId = query.floorId ?? 1;
  if (FORCE_MOCK) return { data: mockResult(floorId), source: 'mock' };

  // Network failures, non-2xx responses, and malformed payloads all throw here
  // and are left to propagate — SWR surfaces them as `error`, which the UI turns
  // into FloorPlanError + a retry button. No silent fallback to sample data.
  const res = await fetch(`${API_URL}${LAYOUT_PATH}${toQueryString(query)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`layout ${res.status}`);

  const body = (await res.json()) as LayoutEnvelope | RawLayoutZone[] | { data: RawLayoutZone[] };
  if (!Array.isArray(body) && 'success' in body && body.success === false) {
    throw new Error(body.error || 'layout: unsuccessful response');
  }
  const raw: RawLayoutZone[] = Array.isArray(body)
    ? body
    : ((body as { data?: RawLayoutZone[] }).data ?? []);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('layout: empty or malformed payload');
  }
  const zones = normalizeRawZones(raw);

  return {
    data: { geometry: synthesizeLayout(zones), status: toStatusFeed(zones) },
    source: 'api',
  };
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
  geometry: FloorLayoutResponse;
  status: SeatStatusZone[];
  source: 'api' | 'mock';
  /** Client-side amenity filter. Non-matching tables are FLAGGED, never dropped,
   *  so the plan keeps showing where every table is. */
  filter?: FloorPlanFilter;
}

/**
 * Joins the geometry layout with the live-status feed by tableId. Tables missing
 * from the status feed default to Available so the plan never renders blank. The
 * amenity filter only sets `matchesFilter` per table — every table stays in the
 * zone so a filtered plan still reads as a room full of tables.
 */
export function buildFloorPlan({
  geometry,
  status,
  source,
  filter,
}: BuildFloorPlanArgs): FloorPlan {
  const statusByTableId = new Map<number, SeatStatusZone['tables'][number]>();
  for (const zone of status) {
    for (const t of zone.tables) statusByTableId.set(t.tableId, t);
  }

  const zones: FloorPlanZone[] = geometry.zones.map((zone) => {
    const counts = emptyCounts();
    let matchCount = 0;
    const tables: FloorPlanTable[] = zone.tables.map((t) => {
      const live = statusByTableId.get(t.tableId);
      const tableStatus: TableStatus = live?.status ?? 'Available';
      counts[tableStatus] += 1;
      const matchesFilter = filter ? tablePassesFilter(t, filter) : true;
      if (matchesFilter) matchCount += 1;
      return {
        ...t,
        zoneId: zone.zoneId,
        zoneType: zone.zoneType,
        status: tableStatus,
        isLocked: live?.isLocked ?? false,
        matchesFilter,
      };
    });

    return {
      zoneId: zone.zoneId,
      zoneType: zone.zoneType,
      label: zone.label,
      bounds: zone.bounds,
      tables,
      counts,
      total: zone.tables.length,
      matchCount,
    };
  });

  return { floor: geometry.floor, zones, source };
}

export function pickZone(plan: FloorPlan, zoneType: ZoneType): FloorPlanZone | undefined {
  return plan.zones.find((z) => z.zoneType === zoneType);
}
