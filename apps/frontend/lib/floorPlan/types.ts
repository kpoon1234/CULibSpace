// Types for the 2D floor-plan UI (FR-2: browse zone/table availability before arrival).
//
// There are TWO data sources behind this UI, kept deliberately separate so the
// slow-changing spatial layout and the fast-changing live status can be fetched
// and cached independently:
//
//   1. Floor layout & zone metadata  — GET /api/floors/:floorId/layout
//      NOT built yet. This file is the contract the "Design & Setup Zone/Table
//      Database Models" + "Implement API to Fetch Floor Layout & Zone Metadata"
//      backlog items should fill. It carries geometry (x/y/shape/size) and static
//      amenities (seats, plugs, TV) — things that only change when the library
//      rearranges furniture.
//
//   2. Live seat status  — GET /api/seats/layout
//      Prototyped on the `seatAPI` branch. Returns each table's realtime status
//      (Available / Reserved / Occupied / Closed) and hold-lock flag, recomputed
//      per request from bookings + lock tokens. Polled on an interval.
//
// `buildFloorPlan()` in ./client merges the two into FloorPlanZone[] for render.

// ---------------------------------------------------------------------------
// Shared enums — string values MUST match Prisma's @map() values exactly
// (apps/backend/prisma/schema.prisma) so API payloads need no translation.
// ---------------------------------------------------------------------------

/** zone_type_enum */
export type ZoneType = 'Silent' | 'Group' | 'Common';

/** table_status_enum — the realtime, computed status of a single table. */
export type TableStatus = 'Available' | 'Reserved' | 'Occupied' | 'Closed';

export const ZONE_TYPES: ZoneType[] = ['Common', 'Silent', 'Group'];
export const TABLE_STATUSES: TableStatus[] = ['Available', 'Reserved', 'Occupied', 'Closed'];

// ---------------------------------------------------------------------------
// 1. Floor layout & zone metadata  (GET /api/floors/:floorId/layout)
// ---------------------------------------------------------------------------

/** A rectangle in the floor's own coordinate space (top-left origin, arbitrary units). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TableShapeKind = 'rect' | 'circle';

/** Static, furniture-level description of one table. Mirrors the `Table` model
 *  plus the geometry the layout API needs to add. */
export interface TableLayout {
  tableId: number;
  /** Short human label drawn on the plan, e.g. "C12", "G3", "S7". */
  code: string;
  shape: TableShapeKind;
  /** Position + size in the parent floor's coordinate space. For `circle`,
   *  width === height and the shape is inscribed in this box. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Table.numberOfSeat */
  seats: number;
  /** Table.plugCap — number of power outlets, null when unknown/none. */
  plugCap: number | null;
  /** Table.hasTvScreen */
  hasTvScreen: boolean;
}

export interface ZoneLayout {
  zoneId: number;
  zoneType: ZoneType;
  /** Display label; defaults to the zone type but lets the library name a
   *  specific room ("Silent — North Wing"). */
  label: string;
  /** The zone's region on the canvas; the view fits/frames this box. */
  bounds: Rect;
  tables: TableLayout[];
}

export interface FloorMeta {
  floorId: number;
  /** Display name, e.g. "Floor 4". */
  name: string;
  /** Sort key for prev/next navigation (a real storey number). */
  ordinal: number;
  /** null when this is the lowest / highest mapped floor. */
  prevFloorId: number | null;
  nextFloorId: number | null;
}

/** The full response of the (not-yet-built) layout endpoint. */
export interface FloorLayoutResponse {
  floor: FloorMeta;
  zones: ZoneLayout[];
}

// ---------------------------------------------------------------------------
// 2. Live seat status  (GET /api/seats/layout — `seatAPI` branch)
// ---------------------------------------------------------------------------

/** One table in the live-status feed. */
export interface SeatStatusTable {
  tableId: number;
  zoneId: number;
  numberOfSeat: number;
  plugCap: number | null;
  hasTvScreen: boolean;
  status: TableStatus;
  /** True while a temporary booking hold-lock is active on the table. */
  isLocked: boolean;
}

export interface SeatStatusZone {
  zoneId: number;
  zoneType: ZoneType;
  tables: SeatStatusTable[];
}

/** Raw envelope returned by GET /api/seats/layout. */
export interface SeatLayoutEnvelope {
  success: boolean;
  data?: SeatStatusZone[];
  error?: string;
}

/** Query params accepted by GET /api/seats/layout. */
export interface SeatLayoutQuery {
  zoneType?: ZoneType;
  /** Minimum plug count. */
  plugCap?: number;
  hasTvScreen?: boolean;
  /** ISO date (YYYY-MM-DD) + HH:mm slot, or an explicit range. */
  date?: string;
  timeSlot?: string;
  startDateTime?: string;
  endDateTime?: string;
}

// ---------------------------------------------------------------------------
// Merged view model — what the components actually render
// ---------------------------------------------------------------------------

export interface FloorPlanTable extends TableLayout {
  zoneId: number;
  zoneType: ZoneType;
  /** From the live feed; falls back to 'Available' if the feed omits the table. */
  status: TableStatus;
  isLocked: boolean;
  /** False when the active amenity filter excludes this table. Such tables stay
   *  on the plan — drawn dimmed and non-interactive — so the space still reads
   *  as occupied by a table you simply can't pick right now. */
  matchesFilter: boolean;
}

export interface FloorPlanZone {
  zoneId: number;
  zoneType: ZoneType;
  label: string;
  bounds: Rect;
  /** Every table in the zone (filtering never removes them, only flags them). */
  tables: FloorPlanTable[];
  /** Convenience counts for headers / summaries. */
  counts: Record<TableStatus, number>;
  total: number;
  /** How many of `tables` pass the active filter (=== total when no filter). */
  matchCount: number;
}

export interface FloorPlan {
  floor: FloorMeta;
  zones: FloorPlanZone[];
  /** 'api' when both feeds came from the backend, 'mock' when any fell back to
   *  bundled sample data. The UI surfaces this so sample numbers are never shown
   *  as live (PRODUCT.md, "Real-time truth over stale state"). */
  source: 'api' | 'mock';
}

// ---------------------------------------------------------------------------
// Client-side amenity filter (mirrors the Table Filter panel in Figma)
// ---------------------------------------------------------------------------

export interface FloorPlanFilter {
  /** Inclusive [min, max] plug-count range, or null for "any". Buckets in Figma:
   *  1–3, 4–6, 7+ — see PLUG_BUCKETS in ./filterOptions. */
  plugRange: [number, number] | null;
  /** true = only tables with a TV / large screen. */
  requiresLargeScreen: boolean;
  /** Booking-window start as a local datetime string ("2026-09-08T14:00"), or
   *  null. Figma's Table Filter has this as a free "Start Date Time" field; it
   *  feeds SeatLayoutQuery.startDateTime verbatim. */
  startDateTime: string | null;
  /** Booking-window end, same format, or null. Feeds SeatLayoutQuery.endDateTime. */
  endDateTime: string | null;
}

export const EMPTY_FILTER: FloorPlanFilter = {
  plugRange: null,
  requiresLargeScreen: false,
  startDateTime: null,
  endDateTime: null,
};
