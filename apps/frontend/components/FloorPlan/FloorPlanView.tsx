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
import ReservationModal from '../Reservation/ReservationModal';

interface FloorPlanViewProps {
  initialFloorId: number;
  initialZone?: ZoneType;
  /** Called once a reservation is confirmed in the booking modal (FR-3). */
  onReserve?: (table: FloorPlanTable) => void;
  /** Wire to issue reporting (FR-7) when it exists. */
  onReportIssue?: (table: FloorPlanTable) => void;
}

const PANEL_ID = 'floor-plan-panel';

// Top-level composition of the 2D floor-plan UI: zone tabs + pan/zoom canvas +
// selected-table detail + amenity filter + floor navigation. Data comes from
// useFloorPlan (GET /api/tables/layout); a network/server failure renders
// FloorPlanError with a retry button instead of the plan.
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
  const [reservingTable, setReservingTable] = useState<FloorPlanTable | null>(null);

  const { plan, isLoading, isError, isStale, isRefreshing, source, refresh } = useFloorPlan(
    floorId,
    { filter }
  );

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

  // Shared across the display label and the validate-booking payload so they
  // never drift apart from two separate `new Date()` calls.
  const reservationDate = new Date();

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
          {source === 'api' && isRefreshing && !isStale && (
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

      {/* A later refresh failed but a plan is still on screen (keepPreviousData) —
          isError alone can't catch this, so surface it as its own inline notice
          instead of leaving a stale, silently-broken plan on screen. */}
      {isStale && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          <span>Couldn&apos;t refresh the floor plan — showing the last known layout.</span>
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-chula-pink/40 bg-paper px-2.5 py-1 text-xs font-medium text-chula-pink transition-colors hover:bg-chula-pink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink"
          >
            Try again
          </button>
        </div>
      )}

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
            onClearFilters={() => setFilter(EMPTY_FILTER)}
            activeFilterCount={activeFilterCount(filter)}
          />
        </div>
        <TableDetailPanel
          table={selectedTable}
          zoneLabel={activeZone.label}
          onClose={() => setSelectedTableId(null)}
          onReserve={setReservingTable}
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

      {reservingTable && (
        <ReservationModal
          isOpen
          onClose={() => setReservingTable(null)}
          tableId={reservingTable.tableId}
          tableCode={reservingTable.code}
          tableZone={activeZone.label}
          initialDate={reservationDate}
          onConfirm={() => onReserve?.(reservingTable)}
        />
      )}
    </section>
  );
}
