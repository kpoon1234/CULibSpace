import { LEGEND_ORDER, STATUS_STYLE } from '@/lib/floorPlan';

interface FloorPlanLegendProps {
  /** Optional per-status counts for the current zone. */
  counts?: Record<(typeof LEGEND_ORDER)[number], number>;
  className?: string;
}

// Status key for the plan. Matches the Figma legend row; swatches use the same
// fill + stroke as the tables so the mapping is unambiguous. The text label is
// always present — colour never carries the meaning alone.
export default function FloorPlanLegend({ counts, className = '' }: FloorPlanLegendProps) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${className}`}>
      {LEGEND_ORDER.map((status) => {
        const s = STATUS_STYLE[status];
        return (
          <li key={status} className="flex items-center gap-2 text-sm text-gray-600">
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 flex-none rounded-[3px]"
              style={{ backgroundColor: s.fill, border: `1.5px solid ${s.stroke}` }}
            />
            <span>{s.text}</span>
            {counts && <span className="tabular-nums text-xs text-gray-400">{counts[status]}</span>}
          </li>
        );
      })}
    </ul>
  );
}
