'use client';

import type { FloorMeta } from '@/lib/floorPlan';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface FloorNavProps {
  floor: FloorMeta;
  onNavigate: (floorId: number) => void;
}

const btn =
  'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-40';

// Previous / next floor stepper (Figma: "<< Back To Previous Floor" /
// "Visit Next Floor >>"). Disabled ends when there's no mapped floor.
export default function FloorNav({ floor, onNavigate }: FloorNavProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className={btn}
        disabled={floor.prevFloorId == null}
        onClick={() => floor.prevFloorId != null && onNavigate(floor.prevFloorId)}
      >
        <ChevronLeftIcon />
        Previous floor
      </button>
      <span className="text-sm font-semibold text-gray-900 tabular-nums">{floor.name}</span>
      <button
        type="button"
        className={btn}
        disabled={floor.nextFloorId == null}
        onClick={() => floor.nextFloorId != null && onNavigate(floor.nextFloorId)}
      >
        Next floor
        <ChevronRightIcon />
      </button>
    </div>
  );
}
