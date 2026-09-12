'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken } from '@/lib/auth';
import { FloorPlanView } from '@/components/FloorPlan';

// Route for the 2D floor-plan UI (FR-2). Data comes from GET /api/tables/layout
// (see lib/floorPlan/README.md); a network/server failure shows an error state
// with a retry button instead of the plan.
export default function ZonesPreviewPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    setAuthorized(true);
  }, [router]);

  if (!authorized) return null;

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
