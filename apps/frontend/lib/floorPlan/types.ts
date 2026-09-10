// Types for the 2D floor-plan UI (FR-2: browse zone/table availability before arrival).
//
// One backend endpoint drives this UI: **GET /api/tables/layout** (the team's
// LayoutController / LayoutService). It returns every zone with its tables, each
// table carrying its live `status` (Available / Reserved / Occupied / Closed)
// recomputed for the requested time window, plus its attributes (seats, plugs,
// TV). Query params (all optional):
//
//   zoneType, plugCap (min), hasTvScreen, minSeats   → attribute filters
//   startDateTime + endDateTime                       → the status time window
//   (no params → all zones/tables, status for now → +1h)
//
// Geometry (per-table x/y/shape/size, per-zone bounds) is OPTIONAL in the
// payload. When the backend omits it, `synthesizeLayout()` in ./autoLayout
// arranges the real tables into a grid, so the map renders real zones / tables /
// statuses even before the schema gains coordinates. `buildFloorPlan()` in
// ./client merges geometry + status into FloorPlanZone[] for render.

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
// Geometry model — what buildFloorPlan() consumes (from the payload if present,
// otherwise synthesised by ./autoLayout).
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

/** A fully-resolved geometry layout (real coords, or synthesised ones). */
export interface FloorLayoutResponse {
  floor: FloorMeta;
  zones: ZoneLayout[];
}

// ---------------------------------------------------------------------------
// Wire shapes — GET /api/tables/layout
// ---------------------------------------------------------------------------

/** One table's live status + attributes, as buildFloorPlan() consumes it. */
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

/** One table exactly as GET /api/tables/layout sends it: status + attributes always,
 *  geometry (code/shape/x/y/size) optional. */
export interface RawLayoutTable {
  tableId: number;
  zoneId?: number;
  numberOfSeat: number;
  plugCap: number | null;
  hasTvScreen: boolean;
  status: TableStatus;
  isLocked?: boolean;
  // optional geometry — filled by ./autoLayout when absent
  code?: string;
  shape?: TableShapeKind;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface RawLayoutZone {
  zoneId: number;
  zoneType: ZoneType;
  label?: string;
  bounds?: Rect;
  tables: RawLayoutTable[];
}

/** Envelope returned by GET /api/tables/layout (a bare array is also tolerated). */
export interface LayoutEnvelope {
  success: boolean;
  data?: RawLayoutZone[];
  error?: string;
}

/** Query params for GET /api/tables/layout (LayoutController). */
export interface LayoutQuery {
  /** UI-only floor concept — not sent (the backend has no floors); used to pick
   *  the sample floor on fallback. */
  floorId?: number;
  zoneType?: ZoneType;
  /** Minimum plug count (Prisma: plugCap gte). */
  plugCap?: number;
  hasTvScreen?: boolean;
  /** Minimum seat count (Prisma: numberOfSeat gte). */
  minSeats?: number;
  /** Local datetime strings — the window the status is computed for. */
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
   *  1–3, 4–6, 7+ — see PLUG_BUCKETS in ./filterOptions. The min maps to the
   *  backend's `plugCap` (gte) param. */
  plugRange: [number, number] | null;
  /** Minimum seat count, or null for "any". Maps to the backend's `minSeats` param. */
  minSeats: number | null;
  /** true = only tables with a TV / large screen. Maps to `hasTvScreen`. */
  requiresLargeScreen: boolean;
  /** Booking-window start as a local datetime string ("2026-09-08T14:00"), or
   *  null. Figma's Table Filter has this as a free "Start Date Time" field; it
   *  feeds LayoutQuery.startDateTime verbatim. */
  startDateTime: string | null;
  /** Booking-window end, same format, or null. Feeds LayoutQuery.endDateTime. */
  endDateTime: string | null;
}

export const EMPTY_FILTER: FloorPlanFilter = {
  plugRange: null,
  minSeats: null,
  requiresLargeScreen: false,
  startDateTime: null,
  endDateTime: null,
};
