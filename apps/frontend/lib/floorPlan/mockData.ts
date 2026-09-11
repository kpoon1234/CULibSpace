import type {
  FloorLayoutResponse,
  SeatStatusZone,
  TableLayout,
  TableStatus,
  ZoneLayout,
} from './types';

// Bundled sample layout + status, used when GET /api/tables/layout is
// unreachable. Geometry mirrors the three Figma frames:
//   - Common: 7×4 grid of square tables (C1–C28)
//   - Silent: 7×2 grid of square carrels (S1–S14)
//   - Group:  mixed shapes — wide tables (G1–G4), round tables (G5–G8),
//             square pods (G9–G14)
//
// Everything here is clearly fake and the UI labels it "Sample data" — see
// FloorPlan.source. Do not let these numbers reach a screen that claims to be
// live (PRODUCT.md, "Real-time truth over stale state").

let tableIdSeq = 1000;

interface GridSpec {
  prefix: string;
  cols: number[];
  rows: number[];
  size: number;
  seats: number;
  /** plugCap cycled across tables in order. */
  plugs: (number | null)[];
  /** codes (1-indexed within the grid) that carry a TV screen. */
  tv?: number[];
}

function grid(spec: GridSpec): TableLayout[] {
  const out: TableLayout[] = [];
  let i = 0;
  for (const y of spec.rows) {
    for (const x of spec.cols) {
      i++;
      out.push({
        tableId: tableIdSeq++,
        code: `${spec.prefix}${i}`,
        shape: 'rect',
        x,
        y,
        width: spec.size,
        height: spec.size,
        seats: spec.seats,
        plugCap: spec.plugs[(i - 1) % spec.plugs.length],
        hasTvScreen: spec.tv?.includes(i) ?? false,
      });
    }
  }
  return out;
}

const COLS_7 = [40, 200, 360, 520, 680, 840, 1000];

const commonZone: ZoneLayout = {
  zoneId: 1,
  zoneType: 'Common',
  label: 'Common',
  bounds: { x: 0, y: 0, width: 1120, height: 680 },
  tables: grid({
    prefix: 'C',
    cols: COLS_7,
    rows: [40, 220, 400, 560],
    size: 80,
    seats: 4,
    plugs: [2, 4, 0, 2, 4, 6, 2],
    tv: [4, 12, 20],
  }),
};

const silentZone: ZoneLayout = {
  zoneId: 2,
  zoneType: 'Silent',
  label: 'Silent',
  bounds: { x: 0, y: 0, width: 1120, height: 460 },
  tables: grid({
    prefix: 'S',
    cols: COLS_7,
    rows: [60, 300],
    size: 80,
    seats: 1,
    plugs: [1, 2, 1, 2, 1, 2, 1],
  }),
};

function groupTable(
  code: string,
  shape: TableLayout['shape'],
  x: number,
  y: number,
  w: number,
  h: number,
  seats: number,
  plugCap: number | null,
  hasTvScreen = false
): TableLayout {
  return {
    tableId: tableIdSeq++,
    code,
    shape,
    x,
    y,
    width: w,
    height: h,
    seats,
    plugCap,
    hasTvScreen,
  };
}

const groupZone: ZoneLayout = {
  zoneId: 3,
  zoneType: 'Group',
  label: 'Group',
  bounds: { x: 0, y: 0, width: 1240, height: 640 },
  tables: [
    // wide tables
    groupTable('G1', 'rect', 40, 40, 220, 90, 8, 4),
    groupTable('G2', 'rect', 340, 40, 220, 90, 8, 4),
    groupTable('G3', 'rect', 640, 40, 220, 90, 8, 6, true),
    groupTable('G4', 'rect', 940, 40, 220, 90, 8, 6, true),
    // round tables
    groupTable('G5', 'circle', 70, 230, 120, 120, 6, 2),
    groupTable('G6', 'circle', 370, 230, 120, 120, 6, 2),
    groupTable('G7', 'circle', 670, 230, 120, 120, 6, 2),
    groupTable('G8', 'circle', 970, 230, 120, 120, 6, 2),
    // square pods
    groupTable('G9', 'rect', 40, 440, 130, 130, 5, 3),
    groupTable('G10', 'rect', 240, 440, 130, 130, 5, 3),
    groupTable('G11', 'rect', 440, 440, 130, 130, 5, 3),
    groupTable('G12', 'rect', 640, 440, 130, 130, 5, 3),
    groupTable('G13', 'rect', 840, 440, 130, 130, 5, 3, true),
    groupTable('G14', 'rect', 1040, 440, 130, 130, 5, 3),
  ],
};

const FLOOR_4: FloorLayoutResponse = {
  floor: { floorId: 1, name: 'Floor 4', ordinal: 4, prevFloorId: null, nextFloorId: 2 },
  zones: [commonZone, silentZone, groupZone],
};

// A second, sparser floor so the prev/next navigation has somewhere to go.
const FLOOR_5: FloorLayoutResponse = {
  floor: { floorId: 2, name: 'Floor 5', ordinal: 5, prevFloorId: 1, nextFloorId: null },
  zones: [
    {
      zoneId: 4,
      zoneType: 'Common',
      label: 'Common',
      bounds: { x: 0, y: 0, width: 1120, height: 460 },
      tables: grid({
        prefix: 'C',
        cols: COLS_7,
        rows: [60, 300],
        size: 80,
        seats: 4,
        plugs: [2, 4, 0, 2, 4, 6, 2],
        tv: [5, 11],
      }),
    },
    {
      zoneId: 5,
      zoneType: 'Silent',
      label: 'Silent',
      bounds: { x: 0, y: 0, width: 1120, height: 300 },
      tables: grid({
        prefix: 'S',
        cols: COLS_7,
        rows: [80],
        size: 80,
        seats: 1,
        plugs: [1, 2],
      }),
    },
  ],
};

export const MOCK_FLOORS: FloorLayoutResponse[] = [FLOOR_4, FLOOR_5];

export function mockFloorLayout(floorId: number): FloorLayoutResponse {
  return MOCK_FLOORS.find((f) => f.floor.floorId === floorId) ?? MOCK_FLOORS[0];
}

// Deterministic sample statuses keyed by table code, so the mock looks like the
// Figma frames instead of random noise. Anything unlisted is Available.
const MOCK_STATUS_BY_CODE: Record<string, TableStatus> = {
  // Common
  C2: 'Occupied',
  C6: 'Occupied',
  C3: 'Closed',
  C22: 'Closed',
  C9: 'Reserved',
  C19: 'Reserved',
  // Silent
  S3: 'Reserved',
  S5: 'Occupied',
  S8: 'Occupied',
  S12: 'Occupied',
  S13: 'Closed',
  // Group
  G2: 'Closed',
  G3: 'Occupied',
  G5: 'Occupied',
  G6: 'Occupied',
  G8: 'Occupied',
  G10: 'Reserved',
  G11: 'Occupied',
  G13: 'Closed',
};

const MOCK_LOCKED_CODES = new Set(['C9', 'G10']);

/** Builds a live-status feed for one floor that matches the sample layout. */
export function mockSeatStatus(floorId: number): SeatStatusZone[] {
  const layout = mockFloorLayout(floorId);
  return layout.zones.map((zone) => ({
    zoneId: zone.zoneId,
    zoneType: zone.zoneType,
    tables: zone.tables.map((t) => ({
      tableId: t.tableId,
      zoneId: zone.zoneId,
      numberOfSeat: t.seats,
      plugCap: t.plugCap,
      hasTvScreen: t.hasTvScreen,
      status: MOCK_STATUS_BY_CODE[t.code] ?? 'Available',
      isLocked: MOCK_LOCKED_CODES.has(t.code),
    })),
  }));
}
