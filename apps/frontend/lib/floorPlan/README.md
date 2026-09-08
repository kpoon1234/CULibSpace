# `lib/floorPlan` — 2D floor-plan data layer

Feeds the `components/FloorPlan` UI (FR-2: browse zone/table availability before
arrival). Built to plug into the team's `LayoutController` / `LayoutService`.

## The one endpoint

### `GET /api/seats/layout` (`LayoutController`)

Override the path with `NEXT_PUBLIC_FLOORPLAN_PATH` (default `/api/seats/layout`).

Returns every zone with its tables. Each table carries its **live `status`**
(`Available` / `Reserved` / `Occupied` / `Closed`, computed for the requested
time window) plus its attributes. Envelope `{ success, data: RawLayoutZone[] }`
or a bare `RawLayoutZone[]` — both accepted.

```jsonc
// RawLayoutZone — what the merged LayoutService returns today
{
  "zoneId": 1,
  "zoneType": "Common", // Silent | Group | Common  (Prisma zone_type_enum)
  "tables": [
    {
      "tableId": 101,
      "numberOfSeat": 4,
      "plugCap": 2, // null when none/unknown
      "hasTvScreen": false,
      "status": "Available", // Prisma table_status_enum value, verbatim
      "isLocked": false,
    },
  ],
  // "label" and "bounds" on the zone, and code/shape/x/y/size on a table,
  // are OPTIONAL — the backend doesn't send them yet; synthesizeLayout() fills
  // them in. Add them to the payload later and the UI uses them automatically.
}
```

**Query params** (all optional):

| param                           | effect                                         |
| ------------------------------- | ---------------------------------------------- |
| _(none)_                        | every zone/table; status for `now → now + 1h`  |
| `zoneType`                      | filter to one zone type                        |
| `plugCap`                       | minimum plug count (Prisma `plugCap gte`)      |
| `hasTvScreen`                   | `true` → only tables with a screen             |
| `minSeats`                      | minimum seat count (Prisma `numberOfSeat gte`) |
| `startDateTime` + `endDateTime` | the window `status` is computed for            |

`toQueryString()` in `client.ts` serialises these. A bad time range (missing one
end, `end <= start`, or a past `start`) makes the backend return HTTP 400 — the
Table Filter dialog validates the pair before it can be applied.

## Geometry is optional — the map still renders

The `Table` / `Zone` models have no coordinates yet. `autoLayout.ts →
synthesizeLayout()` takes whatever the payload gives and produces a complete
geometry layout:

- a table that already has `x` / `y` / `shape` / `size` keeps them verbatim
- one that doesn't is placed on a grid, sized by seat count
- zone `bounds` come from the payload, else from the table extents

It's deterministic (same tables in → same coords out), so nothing jitters
between the status polls that re-run it. When the schema later gains real
coordinates, they're used automatically — no frontend change.

Because the backend has no floor concept, the synthesised `FloorMeta` is a single
`"Library"` floor with `prevFloorId` / `nextFloorId` = null (the floor stepper
shows the name with both arrows disabled). The bundled sample data keeps two
floors so the stepper is demoable.

## How it's wired

```
useFloorPlan(floorId, { filter, serverFilter? })   // the only thing components call
  └─ fetchLayout(query)          // GET /api/seats/layout, polled every STATUS_POLL_MS (20s)
       ├─ synthesizeLayout(zones) -> geometry
       └─ toStatusFeed(zones)     -> live status
  └─ buildFloorPlan({ geometry, status, source, filter })
       -> FloorPlan { floor, zones[], source }   // merged by tableId
```

- **Amenity filtering is client-side by default.** `useFloorPlan` sends only the
  **time window** to `/api/seats/layout`; `plugCap` / `hasTvScreen` / `minSeats` are
  applied in `buildFloorPlan`, which _flags_ non-matching tables
  (`matchesFilter: false`) rather than dropping them — the map dims them so the
  room still reads as full of tables. Pass `serverFilter: true` to instead send
  the amenity params to the backend and let it pre-filter the rows.
- Any fetch/parse failure falls back to bundled sample data (`mockData.ts`) and
  sets `plan.source = 'mock'`, which the UI shows as a **"Sample data"** badge so
  sample numbers are never presented as live (PRODUCT.md, _Real-time truth_).
- `NEXT_PUBLIC_FLOORPLAN_MOCK=1` skips the network entirely.

## Going live

Point `NEXT_PUBLIC_API_URL` at the backend (already the convention in
`lib/auth.ts`) and make sure `GET /api/seats/layout` responds. Nothing in
`components/FloorPlan` or `app/zones` changes — the fetcher stops falling back
and `source` becomes `'api'`. Add table geometry to the payload whenever the
schema supports it; the UI picks it up with no further work.
