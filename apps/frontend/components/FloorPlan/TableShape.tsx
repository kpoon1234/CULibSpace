'use client';

import { memo } from 'react';
import type { SVGProps } from 'react';
import {
  HOVER_STROKE,
  SELECTION_RING,
  STATUS_STYLE,
  amenitySummary,
  statusVerb,
  type FloorPlanTable,
} from '@/lib/floorPlan';

interface TableShapeProps {
  table: FloorPlanTable;
  selected: boolean;
  /** True when the active filter excludes this table: still drawn, but faded
   *  and non-interactive so it reads as "a table you can't pick right now". */
  filteredOut: boolean;
  onSelect: (table: FloorPlanTable) => void;
}

// One table on the plan, as an SVG <g>. rect or circle per the layout geometry.
// Status drives the fill (see STATUS_STYLE); selection is a claret ring, never a
// fill. Closed tables — and tables the filter excludes — are non-interactive; the
// former carry a hatch overlay, the latter are faded, so neither relies on colour.
function TableShapeBase({ table, selected, filteredOut, onSelect }: TableShapeProps) {
  const style = STATUS_STYLE[table.status];
  const { x, y, width, height } = table;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const isCircle = table.shape === 'circle';
  const interactive = !style.disabled && !filteredOut;

  const labelSize = Math.min(width, height) * 0.28;

  const commonShapeProps = {
    fill: style.fill,
    stroke: selected ? SELECTION_RING : style.stroke,
    strokeWidth: selected ? 3 : 1.5,
  };

  const bodyRect = (extra?: Partial<SVGProps<SVGRectElement>>) => (
    <rect x={x} y={y} width={width} height={height} rx={6} {...commonShapeProps} {...extra} />
  );
  const bodyCircle = (extra?: Partial<SVGProps<SVGCircleElement>>) => (
    <circle cx={cx} cy={cy} r={Math.min(width, height) / 2} {...commonShapeProps} {...extra} />
  );

  return (
    <g
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : -1}
      aria-label={
        `Table ${table.code}, ${style.text}. ${amenitySummary(table)}.` +
        (filteredOut
          ? " Doesn't match the current filters — not selectable."
          : interactive
            ? ` ${statusVerb(table.status, table.isLocked)}.`
            : '')
      }
      aria-disabled={filteredOut || undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? () => onSelect(table) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(table);
              }
            }
          : undefined
      }
      className={`fp-table ${interactive ? 'fp-table--interactive' : ''}`}
      style={{
        opacity: filteredOut && !selected ? 0.35 : 1,
        cursor: interactive ? 'pointer' : filteredOut ? 'not-allowed' : 'default',
        transition: 'opacity 120ms ease',
      }}
    >
      {isCircle ? bodyCircle() : bodyRect()}

      {/* Hatch overlay for Closed — pattern is defined in FloorCanvas <defs>. */}
      {table.status === 'Closed' &&
        (isCircle
          ? bodyCircle({ fill: 'url(#fp-hatch)', stroke: 'none' })
          : bodyRect({ fill: 'url(#fp-hatch)', stroke: 'none' }))}

      {/* Hover / focus ring — CSS toggles opacity and recolours on focus-visible,
          so it never fights the selected ring (which is drawn on the body). */}
      {interactive && !selected && (
        <>
          {isCircle
            ? bodyCircle({
                fill: 'none',
                stroke: HOVER_STROKE,
                strokeWidth: 2,
                className: 'fp-table__ring',
              })
            : bodyRect({
                fill: 'none',
                stroke: HOVER_STROKE,
                strokeWidth: 2,
                className: 'fp-table__ring',
              })}
        </>
      )}

      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={labelSize}
        fontWeight={600}
        fill={style.label}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {table.code}
      </text>

      {table.isLocked && table.status === 'Reserved' && (
        <circle
          cx={x + width - 8}
          cy={y + 8}
          r={5}
          fill="var(--claret-500)"
          stroke="var(--paper)"
          strokeWidth={1.5}
        >
          <title>On hold</title>
        </circle>
      )}
    </g>
  );
}

const TableShape = memo(TableShapeBase);
export default TableShape;
