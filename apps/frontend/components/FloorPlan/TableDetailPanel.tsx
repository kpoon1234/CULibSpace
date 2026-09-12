'use client';

import type { ReactNode } from 'react';
import { STATUS_STYLE, seatsLabel, statusVerb, type FloorPlanTable } from '@/lib/floorPlan';
import { CloseIcon, LockIcon, PlugIcon, SeatIcon, TvIcon } from './icons';

interface TableDetailPanelProps {
  table: FloorPlanTable | null;
  zoneLabel: string;
  onClose: () => void;
  /** Fires when the (stub) reserve action is used — wire to FR-3 later. */
  onReserve?: (table: FloorPlanTable) => void;
  /** Fires when the (stub) report action is used — wire to FR-7 later. */
  onReportIssue?: (table: FloorPlanTable) => void;
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-gray-600">
      <span className="text-gray-400">{icon}</span>
      {children}
    </li>
  );
}

// Detail card for the selected table. Presentational — placement (side column vs.
// sheet) is the parent's call. The Reserve button is a stub: booking is FR-3.
export default function TableDetailPanel({
  table,
  zoneLabel,
  onClose,
  onReserve,
  onReportIssue,
}: TableDetailPanelProps) {
  if (!table) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
        Select a table on the plan to see its seats, power outlets and status.
      </div>
    );
  }

  const style = STATUS_STYLE[table.status];
  const canReserve = table.status === 'Available' && !table.isLocked;

  return (
    <div className="rounded-xl border border-gray-200 bg-paper p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {zoneLabel} zone
          </p>
          <h3 className="mt-0.5 text-lg font-semibold text-gray-900">Table {table.code}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close table details"
          className="-mr-1.5 -mt-1.5 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 flex-none rounded-full"
          style={{ backgroundColor: style.fill, border: `1.5px solid ${style.stroke}` }}
        />
        <span className="text-sm font-medium text-gray-900">{style.text}</span>
        {table.isLocked && table.status === 'Reserved' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
            <LockIcon width={12} height={12} /> On hold
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-600">{statusVerb(table.status, table.isLocked)}</p>

      <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4">
        <Row icon={<SeatIcon />}>{seatsLabel(table.seats)}</Row>
        <Row icon={<PlugIcon />}>
          {table.plugCap && table.plugCap > 0
            ? `${table.plugCap} power ${table.plugCap === 1 ? 'outlet' : 'outlets'}`
            : 'No power outlets'}
        </Row>
        <Row icon={<TvIcon />}>{table.hasTvScreen ? 'TV / large screen' : 'No screen'}</Row>
      </ul>

      <div className="mt-5 space-y-2">
        <button
          type="button"
          disabled={!canReserve}
          onClick={() => onReserve?.(table)}
          className="w-full rounded-md bg-chula-pink px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-chula-pink-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reserve this table
        </button>
        <p className="text-center text-xs text-gray-500">
          {canReserve
            ? 'Opens the booking step (time slot & confirmation).'
            : 'Only open tables can be reserved.'}
        </p>
        <button
          type="button"
          onClick={() => onReportIssue?.(table)}
          className="w-full rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          Report an issue with this table
        </button>
      </div>
    </div>
  );
}
