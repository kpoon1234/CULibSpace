import type { TableStatus } from './types';

// Table-status colour mapping — the "Hybrid" direction agreed for this feature.
//
// The Figma mock uses iOS system green / yellow / red / black. That set is
// explicitly ruled out by DESIGN.md ("a green/amber/red status ... would have
// introduced the app's first hues outside the pink/rose family"). This mapping
// keeps the Figma's LAYOUT, legend and interactions but recolours the four
// states onto the Reading Lamp palette:
//
//   Available  paper fill + stone hairline   (an open seat = an empty sheet)
//   Reserved   brass 400                     (brass is the occupancy channel)
//   Occupied   scarlet 500                   (already in the palette)
//   Closed     stone 800 + diagonal hatch    (disabled, out of service)
//
// Selection is claret (the action colour) applied as a ring, never as a fill,
// so it never competes with the status fills. Values are CSS custom properties
// declared on :root in globals.css.
export interface StatusStyle {
  /** SVG fill for the table body. */
  fill: string;
  /** SVG stroke for the table outline. */
  stroke: string;
  /** Colour for the table's code label sitting on the fill. */
  label: string;
  /** Human-readable status name (legend, detail panel, a11y). */
  text: string;
  /** True for states the user cannot act on — rendered non-interactive. */
  disabled: boolean;
}

export const STATUS_STYLE: Record<TableStatus, StatusStyle> = {
  Available: {
    fill: 'var(--paper)',
    stroke: 'var(--stone-400)',
    label: 'var(--stone-700)',
    text: 'Available',
    disabled: false,
  },
  Reserved: {
    fill: 'var(--brass-400)',
    stroke: 'var(--brass-600)',
    label: 'var(--stone-900)',
    text: 'Reserved',
    disabled: false,
  },
  Occupied: {
    fill: 'var(--scarlet-500)',
    stroke: 'var(--scarlet-600)',
    label: '#ffffff',
    text: 'Occupied',
    disabled: false,
  },
  Closed: {
    fill: 'var(--stone-800)',
    stroke: 'var(--stone-900)',
    label: 'var(--stone-100)',
    text: 'Closed',
    disabled: true,
  },
};

/** Claret, applied as the selection ring (never a fill). */
export const SELECTION_RING = 'var(--claret-500)';
/** Stone 400 hover outline for interactive tables. */
export const HOVER_STROKE = 'var(--stone-500)';

/** Fixed order for the legend and any status breakdown. */
export const LEGEND_ORDER: TableStatus[] = ['Available', 'Reserved', 'Occupied', 'Closed'];
