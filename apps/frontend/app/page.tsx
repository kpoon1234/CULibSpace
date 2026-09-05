import SplitHero from '@/components/HomeComponent/SplitHero';
import ZoneAvailabilityGraphic from '@/components/HomeComponent/ZoneAvailabilityGraphic';
import {
  CalendarIcon,
  CheckInIcon,
  ClockIcon,
  PinIcon,
  TicketIcon,
  UndoIcon,
} from '@/components/HomeComponent/icons';

// "Live zone visibility" is elevated into the bento's large tile because it's the one capability a
// walk-up system structurally can't offer — showing it beats describing it. The rest stay compact
// on purpose: turning every item into a feature block would rebuild the repetitive tile pattern at
// a larger size.
const capabilities = [
  {
    title: 'Real-time booking status',
    description:
      'See which tables are already reserved and which are still open, before you commit to a time slot.',
    Icon: ClockIcon,
  },
  {
    title: 'Reserve ahead, held for you',
    description:
      'Pick a table and time slot in advance; the hold keeps anyone else from booking it while you finish.',
    Icon: CalendarIcon,
  },
  {
    title: 'Check in on arrival',
    description:
      'Check-in confirms you made it. Tables left unclaimed are released back to availability automatically.',
    Icon: CheckInIcon,
  },
  {
    title: 'Cancel without penalty',
    description:
      'Plans change — cancel any time at no cost. A visible behaviour score keeps no-shows accountable.',
    Icon: UndoIcon,
  },
  {
    title: 'Open to outside visitors',
    description:
      'CU students and staff book free with a university account; visitors book through a paid ticket.',
    Icon: TicketIcon,
  },
];

const tile = 'flex flex-col rounded-xl border border-gray-200 bg-paper p-6';

export default function Home() {
  return (
    <div>
      <SplitHero />

      <section
        aria-labelledby="capabilities-heading"
        className="grid grid-cols-1 gap-4 px-6 py-14 sm:grid-cols-2 sm:px-10 sm:py-20 lg:grid-cols-3 lg:px-16 xl:px-24"
      >
        <h2 id="capabilities-heading" className="sr-only">
          What CULibSpace does
        </h2>

        <div className={`${tile} gap-5 sm:col-span-2 lg:row-span-2`}>
          <ZoneAvailabilityGraphic />

          <div className="mt-auto flex flex-col gap-2">
            <PinIcon className="h-6 w-6 text-rose-600" />
            <h3 className="text-lg font-semibold text-gray-900">Live zone visibility</h3>
            <p className="max-w-[52ch] text-sm text-gray-600">
              Silent, Group, and Common — see which zones have room right now, filtered by seats,
              plugs, and screens.
            </p>
          </div>
        </div>

        {capabilities.map(({ title, description, Icon }) => (
          <div key={title} className={`${tile} gap-2`}>
            <Icon className="h-6 w-6 text-rose-600" />
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
