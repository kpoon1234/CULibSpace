'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface Slide {
  src: string;
  alt: string;
}

// Single point of change — swap these for the real photo set when it's ready.
const slides: Slide[] = [
  { src: '/img/CU_lib1.png', alt: 'Chulalongkorn University library interior' },
  { src: '/img/placeholder-silent-zone.svg', alt: 'Silent zone — placeholder photo' },
  { src: '/img/placeholder-group-zone.svg', alt: 'Group zone — placeholder photo' },
  { src: '/img/placeholder-common-zone.svg', alt: 'Common zone — placeholder photo' },
];

export default function HeroCarousel() {
  const [index, setIndex] = useState(0);

  const advance = (delta: number) => {
    setIndex((current) => (current + delta + slides.length) % slides.length);
  };

  return (
    <div className="relative h-64 w-full overflow-hidden sm:h-80 lg:h-full">
      <Image
        src={slides[index].src}
        alt={slides[index].alt}
        fill
        priority={index === 0}
        sizes="(min-width: 1024px) 42vw, 100vw"
        className="object-cover"
        style={{ objectPosition: '30% 40%' }}
      />

      <button
        type="button"
        onClick={() => advance(-1)}
        aria-label="Previous photo"
        className="absolute top-1/2 left-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-white/90 text-gray-700 shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={() => advance(1)}
        aria-label="Next photo"
        className="absolute top-1/2 right-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-white/90 text-gray-700 shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>

      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
        {slides.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Go to photo ${i + 1} of ${slides.length}`}
            aria-current={i === index}
            className={`h-2 w-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1 ${
              i === index ? 'bg-rose-600' : 'bg-white/70 hover:bg-white'
            }`}
          />
        ))}
      </div>

      <span className="sr-only" aria-live="polite">
        Showing photo {index + 1} of {slides.length}: {slides[index].alt}
      </span>
    </div>
  );
}
