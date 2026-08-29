import Image from 'next/image';
import { ReactNode } from 'react';

interface BannerProps {
  src: string;
  alt: string;
  height?: string;
  children?: ReactNode;
  overlay?: boolean;
  priority?: boolean;
}

export default function Banner(props: BannerProps) {
  const { src, alt, height = 'h-[500px]', children, overlay = true, priority = false } = props;

  return (
    <section className={`relative w-full ${height} overflow-hidden`}>
      <Image src={src} alt={alt} fill priority={priority} className="object-cover" />

      {overlay && <div className="absolute inset-0 bg-black/40" />}

      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 text-center text-white">
          {children}
        </div>
      )}
    </section>
  );
}
