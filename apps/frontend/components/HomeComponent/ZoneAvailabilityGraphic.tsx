// Illustrative mockup of the live zone view (FR-2), not a functional widget and not wired to the
// backend — the numbers are sample values, labelled as such in the caption below the bars.
// Occupancy is carried by fill length + an explicit count, with density stepping through the
// brass ramp — brass is the palette's density channel precisely so occupancy never competes with
// claret, the action color. Every step clears 3:1 against the track. See DESIGN.md.
interface Zone {
  name: string;
  open: number;
  total: number;
}

const zones: Zone[] = [
  { name: 'Silent', open: 12, total: 40 },
  { name: 'Group', open: 0, total: 18 },
  { name: 'Common', open: 22, total: 52 },
];

function fillColor(occupancy: number) {
  if (occupancy >= 0.9) return 'bg-brass-800';
  if (occupancy >= 0.6) return 'bg-brass-700';
  return 'bg-brass-600';
}

export default function ZoneAvailabilityGraphic() {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {zones.map(({ name, open, total }) => {
          const occupancy = (total - open) / total;

          return (
            <li key={name} className="flex items-center gap-3">
              <span className="w-16 flex-none text-sm font-medium text-gray-900">{name}</span>

              <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                <span
                  className={`block h-full rounded-full ${fillColor(occupancy)}`}
                  style={{ width: `${Math.round(occupancy * 100)}%` }}
                />
              </span>

              <span className="w-28 flex-none text-right text-sm tabular-nums text-gray-600">
                {open} of {total} open
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-gray-500">Sample view — sign in for today&apos;s live numbers.</p>
    </div>
  );
}
