# `lib/` — data-layer architecture

One architecture doc for the modules under `lib/`, rather than a README per
module — add new sections here as `lib/` grows instead of starting another
README.

## `lib/floorPlan` — 2D floor-plan data layer

Feeds the `components/FloorPlan` UI (FR-2: browse zone/table availability before
arrival). Built to plug into the team's `LayoutController` / `LayoutService`.

### The one endpoint

#### `GET /api/tables/layout` (`LayoutController`)

Override the path with `NEXT_PUBLIC_FLOORPLAN_PATH` (default `/api/tables/layout`).

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

### Geometry is optional — the map still renders

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

### How it's wired

```
useFloorPlan(floorId, { filter, serverFilter? })   // the only thing components call
  └─ fetchLayout(query)          // GET /api/tables/layout, polled every STATUS_POLL_MS (20s)
       ├─ synthesizeLayout(zones) -> geometry
       └─ toStatusFeed(zones)     -> live status
  └─ buildFloorPlan({ geometry, status, source, filter })
       -> FloorPlan { floor, zones[], source }   // merged by tableId
```

- **Amenity filtering is client-side by default.** `useFloorPlan` sends only the
  **time window** to `/api/tables/layout`; `plugCap` / `hasTvScreen` / `minSeats` are
  applied in `buildFloorPlan`, which _flags_ non-matching tables
  (`matchesFilter: false`) rather than dropping them — the map dims them so the
  room still reads as full of tables. Pass `serverFilter: true` to instead send
  the amenity params to the backend and let it pre-filter the rows.
- A fetch/HTTP/parse failure REJECTS — `useFloorPlan` surfaces it as `isError`
  and `FloorPlanView` renders `FloorPlanError` (message + a "Try again" button
  that calls `refresh()`). There is no silent fallback to sample data.
- `NEXT_PUBLIC_FLOORPLAN_MOCK=1` is the only way to get bundled sample data
  (`mockData.ts`, `plan.source = 'mock'`, shown as a **"Sample data"** badge) —
  an explicit opt-in for offline demos / Storybook, never an error fallback, so
  sample numbers are never presented as live (PRODUCT.md, _Real-time truth_).

### Going live

Point `NEXT_PUBLIC_API_URL` at the backend (already the convention in
`lib/auth.ts`) and make sure `GET /api/tables/layout` responds. Nothing in
`components/FloorPlan` or `app/zones` changes — `source` becomes `'api'`. Add
table geometry to the payload whenever the schema supports it; the UI picks it
up with no further work.

## `lib/adminUsers` — admin user search (US5-4)

Feeds `components/AdminUsers` on `/admin/users`: a librarian finds a user and
opens their behaviour score + account details. The Score Adjustment Form (a
separate US5-4 task) mounts into the detail panel via
`<UserSearchView renderActions={(user) => …} />`.

### The one endpoint — `AdminUserController.search`

#### `GET /api/admin/users`

Override the path with `NEXT_PUBLIC_ADMIN_USERS_PATH` (default `/api/admin/users`).
Must sit behind `authenticateToken` + `requireRoles('ADMIN')`; the client sends
the stored Bearer token, and treats 401/403 as an expired admin session.

| param      | effect                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `q`        | case-insensitive contains-match on firstname, lastname, "firstname lastname", email, studentId, phone. Omitted/empty → everyone |
| `userType` | `UNIVERSITY` / `THAI` / `FOREIGN` (Prisma `UserType` member names)                                                              |
| `page`     | 1-based, default 1                                                                                                              |
| `pageSize` | default 20, max 100 (400 above that)                                                                                            |

Sort by firstname, then lastname. Response:

```jsonc
{
  "success": true,
  "data": {
    "users": [
      {
        "uid": 4,
        "firstname": "Natthapong",
        "lastname": "Rattanakul",
        "email": "6731100321@student.chula.ac.th",
        "phone": "0812345604", // null if not set
        "userType": "UNIVERSITY",
        "behaviourScore": 45, // Int, 0–100
        "isProfileComplete": true,
        "studentId": "6731100321", // UniversityUser, else null
        "citizenId": null, // ThaiUser — send MASKED, never the full 13 digits
        "passportId": null, // ForeignUser
        "imageUrl": null,
        "createdAt": "2026-08-04T00:00:00.000Z",
      },
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
  },
}
```

### Sample data

`NEXT_PUBLIC_ADMIN_USERS_MOCK=1` serves invented users from `mockData.ts`
(filtered and paged by the same rules) and the list shows a **"Sample data"**
badge. Like the floor plan, it is an explicit opt-in, never an error fallback.

The "can't book" flag and the marker on the score bar read `minScoreToBook`
via `useBookingLimits()` from `GET /api/system-config/booking-limits`. That
endpoint doesn't send the field yet, so it falls back to 50 (the backend's
default for `SystemConfig.minScoreToBook`). Once the backend adds
`minScoreToBook` to that response, the UI picks it up with no frontend change.

## `lib/tickets` — visitor ticket purchase (US6-1)

`lib/tickets.ts` is the frontend data-layer client for starting a visitor ticket
purchase. Route and feature UI code call `purchaseVisitorTicket()` rather than
calling the ticket API directly. The helper reads the current bearer token from
`lib/auth.ts`, sends a client-generated idempotency key, and returns a typed
success/error result including backend error codes and retryability.

### The purchase endpoint

#### `POST /api/tickets/purchase`

Requires an authenticated `OUTSIDER` account with a completed visitor profile.
The client sends only `{ idempotencyKey }`; price and ticket validity come from
backend `SystemConfig`, never from form fields. On success, the page redirects
to the returned `checkoutUrl`. Keep the same key when recovering a pending or
unconfirmed attempt; use a new key after a terminal failed/expired attempt.

### Entry points and booking handoff

- An outsider can open `/visitor/ticket` from **Buy visitor ticket** in the
  account menu, without first attempting to reserve a table.
- When booking returns `TICKET_REQUIRED`, `ReservationSession` preserves the
  backend code and `ReservationModal` offers the same purchase route.
- Do not carry a table hold across Stripe checkout. Holds expire independently
  of payment; after the ticket is confirmed active, the visitor starts a fresh
  reservation flow.
- `/tickets/success` reports that payment is being checked; it does not treat
  the Stripe redirect as proof of payment. US6-3 webhook processing activates
  the ticket. `/tickets/cancel` returns the visitor to the purchase route.

API/network failures remain explicit in the page; there is no mock or silent
fallback. The ticket-list/history endpoint belongs to US6-2 and is documented
when its frontend client is added.
