'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Banner from '@/components/HomeComponent/Banner';
import { clearAuth, getAuthToken, type AuthUser } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired');
        return response.json() as Promise<{ user: AuthUser }>;
      })
      .then(({ user: currentUser }) => {
        if (currentUser.isProfileComplete === false) {
          router.replace('/onboarding');
          return;
        }
        setUser(currentUser);
      })
      .catch(() => {
        clearAuth();
        router.replace('/login');
      });
  }, [router]);

  return (
    <div>
      <Banner src="/img/CU_lib1.png" alt="Library image">
        <h1 className="text-5xl font-bold text-shadow-2xl">CULibSpace</h1>
        {user && (
          <p className="mt-3 text-lg">
            Welcome, {user.firstname} ({user.role})
          </p>
        )}
      </Banner>
    </div>
  );
}
