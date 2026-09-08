# `lib/floorPlan` — 2D floor-plan data layer

Feeds the `components/FloorPlan` UI (FR-2: browse zone/table availability before
arrival). Built to plug into the backend without component changes.

## Two backend endpoints

### 1. `GET /api/floors/:floorId/layout` — **not built yet**

Static spatial layout + zone metadata. This is the contract for the backlog
items _"Design & Setup Zone/Table Database Models"_ and _"Implement API to Fetch
Floor Layout & Zone Metadata"_. Shape = `FloorLayoutResponse` in `types.ts`:

```jsonc
{
  "floor": {
    "floorId": 1,
    "name": "Floor 4",
    "ordinal": 4,
    "prevFloorId": null,
    "nextFloorId": 2,
  },
  "zones": [
    {
      "zoneId": 1,
      "zoneType": "Common",
      "label": "Common",
      "bounds": { "x": 0, "y": 0, "width": 1120, "height": 680 },
      "tables": [
        {
          "tableId": 101,
          "code": "C1",
          "shape": "rect",
          "x": 40,
          "y": 40,
          "width": 80,
          "height": 80,
          "seats": 4,
          "plugCap": 2,
          "hasTvScreen": false,
        },
        // circle tables: shape "circle", width === height
      ],
    },
  ],
}
```

The `Table` model on `main` already has `numberOfSeat` / `plugCap` /
`hasTvScreen`. What's missing and needs adding: **per-table geometry**
(`shape`, `x`, `y`, `width`, `height`), a **zone `bounds`** rectangle, a
human **`code`** per table, and a **floor** entity with an ordinal + prev/next
links. Coordinates are in each floor's own arbitrary unit space, top-left
origin; the client fits `bounds` to the viewport.

### 2. `GET /api/seats/layout` — prototyped on the `seatAPI` branch

Live, per-request status. Shape = `SeatLayoutEnvelope` in `types.ts`
(`{ success, data: [{ zoneId, zoneType, tables: [{ tableId, status, isLocked, … }] }] }`).
Query params: `zoneType`, `plugCap`, `hasTvScreen`, `date`+`timeSlot` or
`startDateTime`+`endDateTime`. Polled every `STATUS_POLL_MS` (20s).

`status` values are the Prisma `table_status_enum` strings verbatim:
`Available` · `Reserved` · `Occupied` · `Closed`.

## How it's wired

```
useFloorPlan(floorId, { filter })      // SWR hook, the only thing components call
  ├─ fetchFloorLayout(floorId)         // resource 1, cached ~forever per floor
  ├─ fetchSeatStatus(floorId, query)   // resource 2, polled
  └─ buildFloorPlan({ layout, status, source, filter })
        → merges by tableId → FloorPlan { floor, zones[], source }
```

- Either fetch falling back to bundled sample data (`mockData.ts`) sets
  `plan.source = 'mock'`, and the UI shows a **"Sample data"** badge so sample
  numbers are never presented as live (PRODUCT.md, _Real-time truth_).
- Set `NEXT_PUBLIC_FLOORPLAN_MOCK=1` to skip the network entirely.
- Amenity filters (plug range, large screen) are applied client-side in
  `buildFloorPlan`; start-time + duration are forwarded to the status query as
  the booking window.

## Going live

When both endpoints exist, nothing in `components/FloorPlan` or `app/zones`
changes — the fetchers stop falling back and `source` becomes `'api'`. Point
`NEXT_PUBLIC_API_URL` at the backend (already the convention in `lib/auth.ts`).
