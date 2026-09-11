'use client';

import type { ZoneType } from '@/lib/floorPlan';

export interface ZoneTabOption {
  zoneType: ZoneType;
  label: string;
  /** Open-table count, shown as a quiet secondary number. */
  open?: number;
}

interface ZoneTabsProps {
  options: ZoneTabOption[];
  active: ZoneType;
  onChange: (zone: ZoneType) => void;
  /** id of the panel these tabs control, for aria-controls. */
  panelId?: string;
}

// Segmented control, per DESIGN.md: stone-100 track, rounded-md, compact
// (px-4 py-1.5 text-sm). Active segment is Paper with a hairline lift — zones
// carry no brand colour, so the Figma's cyan/green/yellow fills are dropped.
export default function ZoneTabs({ options, active, onChange, panelId }: ZoneTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Seating zone"
      className="inline-flex gap-1 rounded-md bg-gray-100 p-1"
    >
      {options.map((opt) => {
        const selected = opt.zoneType === active;
        return (
          <button
            key={opt.zoneType}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.zoneType)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const i = options.findIndex((o) => o.zoneType === active);
              const next =
                e.key === 'ArrowRight'
                  ? (i + 1) % options.length
                  : (i - 1 + options.length) % options.length;
              onChange(options[next].zoneType);
            }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
              selected ? 'bg-paper text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {opt.label}
            {typeof opt.open === 'number' && (
              <span
                className={`ml-1.5 tabular-nums text-xs ${selected ? 'text-gray-500' : 'text-gray-400'}`}
              >
                {opt.open}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
