interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  headingId: string;
}

export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  headingId,
}: SectionHeadingProps) {
  return (
    <div className="mb-6 flex max-w-[64ch] flex-col gap-3 sm:mb-8">
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 flex-none rounded-full bg-chula-pink" aria-hidden="true" />
        <span className="text-sm font-bold tracking-widest text-chula-pink uppercase">
          {eyebrow}
        </span>
      </div>
      <h2
        id={headingId}
        className="text-3xl leading-tight font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl"
      >
        {title}
      </h2>
      <p className="text-base text-gray-600">{subtitle}</p>
    </div>
  );
}
