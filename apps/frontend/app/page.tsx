import SplitHero from '@/components/HomeComponent/SplitHero';
import SectionHeading from '@/components/HomeComponent/SectionHeading';
import ZoneAvailabilityGraphic from '@/components/HomeComponent/ZoneAvailabilityGraphic';
import SignInUnlockCard from '@/components/HomeComponent/SignInUnlockCard';
import { CalendarIcon, CheckInIcon, ClockIcon, FilterIcon } from '@/components/HomeComponent/icons';

const capabilities = [
  {
    title: 'Real-time booking status',
    description:
      'See which tables are already reserved and which are still open, before you commit to a time slot.',
    Icon: ClockIcon,
    featured: true,
  },
  {
    title: 'Filter by exact study preferences',
    description:
      'Search by seats, power outlets, screens, or quiet level to find the table that actually fits.',
    Icon: FilterIcon,
    featured: false,
  },
  {
    title: 'Reserve ahead, held for you',
    description:
      'Pick a table and time slot in advance; the hold keeps anyone else from booking it while you finish.',
    Icon: CalendarIcon,
    featured: false,
  },
  {
    title: 'Accountable check-in & fair use',
    description:
      'Check in on arrival or cancel free of charge — a visible behaviour score keeps no-shows accountable.',
    Icon: CheckInIcon,
    featured: false,
  },
];

const card = 'flex flex-col gap-4 rounded-xl border bg-paper p-6 shadow-sm';

export default function Home() {
  return (
    <div>
      <SplitHero />

      <section
        aria-labelledby="capabilities-heading"
        className="px-6 py-12 sm:px-10 sm:py-16 lg:px-16 xl:px-24"
      >
        <SectionHeading
          headingId="capabilities-heading"
          eyebrow="What CULibSpace does"
          title="Everything a walk-up line can't do"
          subtitle="Real-time visibility, advance holds, and accountable check-in — built around how you actually study."
        />

        <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
          {capabilities.map(({ title, description, Icon, featured }) => (
            <div
              key={title}
              className={`${card} ${featured ? 'border-2 border-chula-pink' : 'border-hairline'}`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  featured ? 'bg-chula-pink/10' : 'border border-hairline bg-white'
                }`}
              >
                <Icon className={`h-5 w-5 ${featured ? 'text-chula-pink' : 'text-cta-primary'}`} />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="text-base text-gray-600">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="zones-heading"
        className="bg-canvas-subtle px-6 py-12 sm:px-10 sm:py-16 lg:px-16 xl:px-24"
      >
        <SectionHeading
          headingId="zones-heading"
          eyebrow="Live zone availability"
          title="See what's open before you walk in"
          subtitle="Silent, Group, and Common — sign in for live counts, or preview a sample view below."
        />

        <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
          <div className={`${card} border-hairline`}>
            <ZoneAvailabilityGraphic />
          </div>
          <div className={`${card} border-hairline`}>
            <SignInUnlockCard />
          </div>
        </div>
      </section>
    </div>
  );
}
