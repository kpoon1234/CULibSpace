'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('http://localhost:8080/auth/me', {
          credentials: 'include',
        });

        if (res.ok) {
          router.replace('/');
        } else {
          router.replace('/login');
        }
      } catch {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-600">Completing sign-in...</p>
    </div>
  );
}
