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
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isFull ? 'bg-ochre/10 text-ochre' : 'bg-spruce/10 text-spruce'
                  }`}
                >
                  {isFull ? 'Full / In Use' : `${pctAvailable}% Available`}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-ochre/15">
                  <span
                    className="block h-full rounded-full bg-spruce"
                    style={{ width: `${pctAvailable}%` }}
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
