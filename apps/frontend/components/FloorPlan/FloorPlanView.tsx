'use client';

import { useMemo, useState } from 'react';
import {
  EMPTY_FILTER,
  activeFilterCount,
  availabilityLine,
  pickZone,
  tablePassesFilter,
  useFloorPlan,
  type FloorPlanFilter,
  type FloorPlanTable,
  type ZoneType,
} from '@/lib/floorPlan';
import ZoneTabs, { type ZoneTabOption } from './ZoneTabs';
import FloorCanvas from './FloorCanvas';
import FloorPlanLegend from './FloorPlanLegend';
import TableDetailPanel from './TableDetailPanel';
import FloorPlanFilters from './FloorPlanFilters';
import FloorNav from './FloorNav';
import { FloorPlanError, FloorPlanSkeleton } from './FloorPlanStates';

interface FloorPlanViewProps {
  initialFloorId: number;
  initialZone?: ZoneType;
  /** Wire to the booking flow (FR-3) when it exists. */
  onReserve?: (table: FloorPlanTable) => void;
  /** Wire to issue reporting (FR-7) when it exists. */
  onReportIssue?: (table: FloorPlanTable) => void;
}

const PANEL_ID = 'floor-plan-panel';

// Top-level composition of the 2D floor-plan UI: zone tabs + pan/zoom canvas +
// selected-table detail + amenity filter + floor navigation. Data comes from
// useFloorPlan, which serves bundled sample data until the backend endpoints
// (GET /api/floors/:id/layout, GET /api/seats/layout) are live.
export default function FloorPlanView({
  initialFloorId,
  initialZone = 'Common',
  onReserve,
  onReportIssue,
}: FloorPlanViewProps) {
  const [floorId, setFloorId] = useState(initialFloorId);
  const [requestedZone, setRequestedZone] = useState<ZoneType>(initialZone);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FloorPlanFilter>(EMPTY_FILTER);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { plan, isLoading, isError, isRefreshing, source, refresh } = useFloorPlan(floorId, {
    filter,
  });

  // The requested zone may not exist on every floor; fall back to the first.
  const activeZone = useMemo(() => {
    if (!plan) return undefined;
    return pickZone(plan, requestedZone) ?? plan.zones[0];
  }, [plan, requestedZone]);

  if (isLoading) return <FloorPlanSkeleton />;
  if (isError || !plan || !activeZone) return <FloorPlanError onRetry={refresh} />;

  const zoneOptions: ZoneTabOption[] = plan.zones.map((z) => ({
    zoneType: z.zoneType,
    label: z.label,
    open: z.counts.Available,
  }));

  const selectedTable =
    selectedTableId != null
      ? (activeZone.tables.find((t) => t.tableId === selectedTableId) ?? null)
      : null;

  return (
    <section aria-label="Floor plan" className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Browse seats</h2>
          {source === 'mock' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brass-100 px-2 py-0.5 text-xs font-medium text-brass-800">
              Sample data
            </span>
          )}
          {source === 'api' && isRefreshing && (
            <span className="text-xs text-gray-400">Updating…</span>
          )}
        </div>
        <FloorNav
          floor={plan.floor}
          onNavigate={(id) => {
            setSelectedTableId(null);
            setFloorId(id);
          }}
        />
      </div>

      {/* Zone switch + availability line */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ZoneTabs
          options={zoneOptions}
          active={activeZone.zoneType}
          onChange={(z) => {
            setSelectedTableId(null);
            setRequestedZone(z);
          }}
          panelId={PANEL_ID}
        />
        <p className="text-sm text-gray-600 tabular-nums">
          {availabilityLine(activeZone.counts, activeZone.total)}
        </p>
      </div>

      {/* Canvas + detail */}
      <div id={PANEL_ID} role="tabpanel" className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[420px] sm:h-[520px]">
          <FloorCanvas
            zone={activeZone}
            selectedTableId={selectedTableId}
            onSelect={(t) => setSelectedTableId(t.tableId)}
            onOpenFilters={() => setFiltersOpen(true)}
            activeFilterCount={activeFilterCount(filter)}
          />
        </div>
        <TableDetailPanel
          table={selectedTable}
          zoneLabel={activeZone.label}
          onClose={() => setSelectedTableId(null)}
          onReserve={onReserve}
          onReportIssue={onReportIssue}
        />
      </div>

      {/* Legend */}
      <FloorPlanLegend counts={activeZone.counts} />

      {filtersOpen && (
        <FloorPlanFilters
          value={filter}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
            setFilter(next);
            // Drop the selection only if the new filter would exclude it.
            if (selectedTable && !tablePassesFilter(selectedTable, next)) {
              setSelectedTableId(null);
            }
          }}
        />
      )}
    </section>
  );
}
