// Illustrative mockup of the live zone view (FR-2), not a functional widget and not wired to the
// backend — the numbers are sample values, labelled as such in the caption below the list.
// The meter is two-tone: the spruce fill grows with open capacity, the ochre track behind it
// reads as booked/full — so "available" and "full" never share a color. See DESIGN.md.
import { PlugIcon, ScreenIcon, SeatIcon } from './icons';

interface Zone {
  name: string;
  open: number;
  total: number;
  amenities: { label: string; Icon: typeof SeatIcon }[];
}

const zones: Zone[] = [
  {
    name: 'Silent',
    open: 12,
    total: 40,
    amenities: [
      { label: 'Seats', Icon: SeatIcon },
      { label: 'Power outlets', Icon: PlugIcon },
    ],
  },
  {
    name: 'Group',
    open: 0,
    total: 18,
    amenities: [
      { label: 'Seats', Icon: SeatIcon },
      { label: 'Power outlets', Icon: PlugIcon },
      { label: 'Screens', Icon: ScreenIcon },
    ],
  },
  {
    name: 'Common',
    open: 22,
    total: 52,
    amenities: [
      { label: 'Seats', Icon: SeatIcon },
      { label: 'Power outlets', Icon: PlugIcon },
      { label: 'Screens', Icon: ScreenIcon },
    ],
  },
];

// Fallback hex and RGBA values for environments where CSS variables are missing or unsupported
const FALLBACK_SPRUCE = '#1b4d3e';
const FALLBACK_SPRUCE_BG = 'rgba(27, 77, 62, 0.1)';
const FALLBACK_OCHRE = '#c87d20';
const FALLBACK_OCHRE_BG = 'rgba(200, 125, 32, 0.1)';
const FALLBACK_OCHRE_TRACK = 'rgba(200, 125, 32, 0.15)';

export default function ZoneAvailabilityGraphic() {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-5">
        {zones.map(({ name, open, total, amenities }) => {
          const pctAvailable = Math.round((open / total) * 100);
          const isFull = open === 0;

          return (
            <li key={name} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-900">{name}</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: isFull
                      ? `var(--color-ochre-bg, ${FALLBACK_OCHRE_BG})`
                      : `var(--color-spruce-bg, ${FALLBACK_SPRUCE_BG})`,
                    color: isFull
                      ? `var(--color-ochre, ${FALLBACK_OCHRE})`
                      : `var(--color-spruce, ${FALLBACK_SPRUCE})`,
                  }}
                >
                  {isFull ? 'Full / In Use' : `${pctAvailable}% Available`}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="h-2 flex-1 overflow-hidden rounded-full"
                  style={{
                    backgroundColor: `var(--color-ochre-track, ${FALLBACK_OCHRE_TRACK})`,
                  }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${pctAvailable}%`,
                      backgroundColor: `var(--color-spruce, ${FALLBACK_SPRUCE})`,
                    }}
                  />
                </span>
                <span className="w-24 flex-none text-right text-sm tabular-nums text-gray-600">
                  {open} of {total} open
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {amenities.map(({ label, Icon }) => (
                  <span key={label} className="flex items-center gap-1 text-xs text-gray-500">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-gray-500">Sample view — sign in for today&apos;s live numbers.</p>
    </div>
  );
}
