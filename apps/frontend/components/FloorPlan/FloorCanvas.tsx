'use client';

import type { FloorPlanTable, FloorPlanZone } from '@/lib/floorPlan';
import TableShape from './TableShape';
import { usePanZoom } from './usePanZoom';
import { FunnelIcon, MinusIcon, PlusIcon, RecenterIcon } from './icons';

interface FloorCanvasProps {
  zone: FloorPlanZone;
  selectedTableId: number | null;
  onSelect: (table: FloorPlanTable) => void;
  onOpenFilters: () => void;
  onClearFilters: () => void;
  activeFilterCount: number;
}

const ctrlBtn =
  'flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-paper text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500';

// The pannable / zoomable plan surface. Tables are drawn in the zone's own
// coordinate space inside a <g transform>; usePanZoom fits that box to the
// container and handles wheel / drag / button zoom.
export default function FloorCanvas({
  zone,
  selectedTableId,
  onSelect,
  onOpenFilters,
  onClearFilters,
  activeFilterCount,
}: FloorCanvasProps) {
  const { containerRef, matrix, isPanning, onPointerDown, onWheel, zoomIn, zoomOut, reset } =
    usePanZoom(zone.bounds, [zone.zoneId]);
  const filtering = activeFilterCount > 0;
  const excludedCount = zone.total - zone.matchCount;
  const noMatches = filtering && zone.total > 0 && zone.matchCount === 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-xl border border-gray-200 bg-stone-50"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      role="group"
      aria-label={`${zone.label} zone floor plan`}
    >
      <svg width="100%" height="100%" role="presentation">
        <defs>
          {/* Diagonal hatch for Closed tables — referenced as url(#fp-hatch) in TableShape. */}
          <pattern
            id="fp-hatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--stone-500)" strokeWidth="2" />
          </pattern>
        </defs>

        <g transform={matrix}>
          {/* Zone floor slab */}
          <rect
            x={zone.bounds.x}
            y={zone.bounds.y}
            width={zone.bounds.width}
            height={zone.bounds.height}
            rx={12}
            fill="var(--paper)"
            stroke="var(--stone-200)"
            strokeWidth={1.5}
          />
          {zone.tables.map((t) => (
            <TableShape
              key={t.tableId}
              table={t}
              selected={t.tableId === selectedTableId}
              filteredOut={filtering && !t.matchesFilter}
              onSelect={onSelect}
            />
          ))}
        </g>
      </svg>

      {/* Filter trigger — top-right, as in the Figma */}
      <button
        type="button"
        onClick={onOpenFilters}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-gray-300 bg-paper px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        aria-label={`Filter tables${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}
      >
        <FunnelIcon />
        <span>Filter</span>
        {activeFilterCount > 0 && (
          <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white tabular-nums">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Zoom controls — bottom-right */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button type="button" className={ctrlBtn} onClick={zoomIn} aria-label="Zoom in">
          <PlusIcon />
        </button>
        <button type="button" className={ctrlBtn} onClick={zoomOut} aria-label="Zoom out">
          <MinusIcon />
        </button>
        <button type="button" className={ctrlBtn} onClick={reset} aria-label="Reset view">
          <RecenterIcon />
        </button>
      </div>

      {/* Genuinely-empty zone (no tables mapped yet) */}
      {zone.total === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-xs rounded-xl border border-gray-200 bg-paper p-5 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-900">No tables in {zone.label} yet</p>
            <p className="mt-1 text-xs text-gray-500">
              This zone has no tables mapped on this floor.
            </p>
          </div>
        </div>
      )}

      {/* Filter status — tables that don't match stay on the plan, dimmed. */}
      {filtering && zone.total > 0 && zone.matchCount > 0 && (
        <p className="absolute bottom-3 left-3 max-w-[16rem] rounded-md bg-paper/90 px-2 py-1 text-xs text-gray-600 shadow-sm">
          <span className="font-medium tabular-nums text-gray-900">
            {zone.matchCount} of {zone.total}
          </span>{' '}
          match your filters. The other {excludedCount} are dimmed and can&apos;t be picked.
        </p>
      )}

      {/* No table in this zone survives the active filter — surface it as its own
          state rather than making the user notice every table went dim. */}
      {noMatches && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-xs rounded-xl border border-gray-200 bg-paper p-5 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-900">No tables match your filters</p>
            <p className="mt-1 text-xs text-gray-500">
              All {zone.total} tables in {zone.label} are dimmed and can&apos;t be picked with these
              filters.
            </p>
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-3 rounded-md bg-chula-pink px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-chula-pink-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
