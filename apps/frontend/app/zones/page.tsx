'use client';

import { FloorPlanView } from '@/components/FloorPlan';

// Preview route for the 2D floor-plan UI (FR-2). Renders on bundled sample data
// until the backend endpoints land:
//   GET /api/floors/:floorId/layout   (layout & zone metadata — not built yet)
//   GET /api/seats/layout             (live status — prototyped on `seatAPI`)
// Once both exist, FloorPlanView switches to live data automatically; no change
// needed here. See lib/floorPlan for the data contract.
export default function ZonesPreviewPage() {
  return (
    <div className="px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-semibold text-gray-900">Floor plan</h1>
        <p className="mt-1 text-sm text-gray-600">
          Silent, Group and Common zones on an interactive 2D plan. Pick a zone, pan and zoom the
          map, and select a table to see its seats, power outlets and live status.
        </p>
      </header>

      <FloorPlanView initialFloorId={1} initialZone="Common" />
    </div>
  );
}
