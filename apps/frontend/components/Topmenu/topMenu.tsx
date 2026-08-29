import Image from 'next/image';
import TopMenuItem from './topMenuItem';

export default function TopMenu() {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-stretch bg-pink-400 px-4 shadow-sm">
      <div className="flex items-center">
        <Image
          src="/img/Logo.jpg"
          alt="logo"
          width={0}
          height={0}
          sizes="100vh"
          className="h-10 w-auto"
        />
      </div>

      <TopMenuItem label="Home" href="/" />
      <TopMenuItem label="Login" href="/login" />
    </header>
  );
}
