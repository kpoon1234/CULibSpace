'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import HistoryBookingModal from '@/components/Profile/HistoryBookingModal';
import { getAuthToken } from '@/lib/auth';

export default function BookingHistoryPage() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    }
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-pink-100 p-4">
      <HistoryBookingModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          router.push('/');
        }}
      />
    </main>
  );
}
