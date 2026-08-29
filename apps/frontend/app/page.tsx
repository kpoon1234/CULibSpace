import Image from 'next/image';
import Banner from '@/components/HomeComponent/Banner';

export default function Home() {
  return (
    <div>
      <Banner src="/img/CU_lib1.png" alt="Library image">
        <h1 className="text-5xl font-bold text-shadow-2xl">CULibSpace</h1>
      </Banner>
    </div>
  );
}
