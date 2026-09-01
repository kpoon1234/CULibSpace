import SplitHero from '@/components/HomeComponent/SplitHero';
import { CalendarIcon, PinIcon } from '@/components/HomeComponent/icons';

const capabilities = [
  {
    title: 'Every zone, live',
    description:
      'Silent, Group, and Common — filtered by seats, plugs, and screens, updated as you look.',
    Icon: PinIcon,
  },
  {
    title: 'One booking, held',
    description: 'Reserve ahead with a locked hold; cancel any time with no penalty.',
    Icon: CalendarIcon,
  },
];

export default function Home() {
  return (
    <div>
      <SplitHero />

      <section className="grid grid-cols-1 gap-10 bg-rose-50 px-6 py-14 sm:grid-cols-2 sm:px-10 sm:py-20 lg:px-16">
        {capabilities.map(({ title, description, Icon }) => (
          <div key={title} className="flex flex-col gap-2">
            <Icon className="h-6 w-6 text-rose-600" />
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
