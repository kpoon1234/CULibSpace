import type {
  FloorLayoutResponse,
  FloorMeta,
  Rect,
  RawLayoutZone,
  TableLayout,
  ZoneLayout,
} from './types';

// GET /api/tables/layout returns tables with their status + attributes, but the schema
// has no spatial coordinates yet. This module turns whatever it does send into a
// renderable geometry layout:
//   - if a table already carries x/y/shape/size, those are kept verbatim
//   - otherwise it's placed on a simple grid, sized by seat count
// The mapping is deterministic (same tables in → same coords out), so nothing
// jitters between the status polls that re-run this every interval.

const TILE = 80;
const GAP = 60;
const PAD = 40;
const PER_ROW = 7;

/** Grid cell size for a table, nudged up a little for larger tables. */
function tileSize(seats: number): number {
  return TILE + Math.min(48, Math.max(0, (seats - 2) * 8));
}

/** Smallest rect containing every table, plus padding — used when the payload
 *  gives table coordinates but no explicit zone bounds. */
function boundsFromTables(tables: TableLayout[]): Rect {
  if (tables.length === 0) return { x: 0, y: 0, width: 480, height: 320 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tables) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.width);
    maxY = Math.max(maxY, t.y + t.height);
  }
  return {
    x: minX - PAD,
    y: minY - PAD,
    width: maxX - minX + PAD * 2,
    height: maxY - minY + PAD * 2,
  };
}

/**
 * Build a fully-resolved geometry layout from the /api/tables/layout payload, filling
 * in any missing coordinates with a grid arrangement.
 */
export function synthesizeLayout(
  zones: RawLayoutZone[],
  floorName = 'Library'
): FloorLayoutResponse {
  const zoneLayouts: ZoneLayout[] = zones.map((zone) => {
    const prefix = zone.zoneType.charAt(0).toUpperCase();
    const tables: TableLayout[] = zone.tables.map((t, i) => {
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      const size = tileSize(t.numberOfSeat);
      return {
        tableId: t.tableId,
        code: t.code ?? `${prefix}${i + 1}`,
        shape: t.shape ?? 'rect',
        x: t.x ?? PAD + col * (TILE + GAP),
        y: t.y ?? PAD + row * (TILE + GAP),
        width: t.width ?? size,
        height: t.height ?? size,
        seats: t.numberOfSeat,
        plugCap: t.plugCap,
        hasTvScreen: t.hasTvScreen,
      };
    });

    return {
      zoneId: zone.zoneId,
      zoneType: zone.zoneType,
      label: zone.label ?? zone.zoneType,
      bounds: zone.bounds ?? boundsFromTables(tables),
      tables,
    };
  });

  const floor: FloorMeta = {
    floorId: 1,
    name: floorName,
    ordinal: 1,
    prevFloorId: null,
    nextFloorId: null,
  };

  return { floor, zones: zoneLayouts };
}
