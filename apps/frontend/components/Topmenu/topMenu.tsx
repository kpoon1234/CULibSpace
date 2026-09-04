import Image from 'next/image';
import TopMenuItem from './topMenuItem';

export default function TopMenu() {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-stretch bg-pink-400 px-4 shadow-sm">
      <div className="flex h-full items-center py-2 pr-4">
        <div className="relative h-full w-12">
          <Image src="/img/Logo.jpg" alt="logo" fill sizes="48px" className="object-contain" />
        </div>
      </div>

      <div className="flex items-stretch">
        <TopMenuItem label="Home" href="/" />
        <TopMenuItem label="Login" href="/login" />
      </div>
    </header>
  );
}
