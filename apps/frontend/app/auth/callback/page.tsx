'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_URL, saveAuth, type AuthUser } from '@/lib/auth';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function checkAuth() {
      try {
        const token = searchParams.get('token');
        const res = await fetch(`${API_URL}/api/auth/me`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (res.ok) {
          const data = (await res.json()) as { user: AuthUser };
          if (token) saveAuth(token, data.user);
          router.replace(data.user.isProfileComplete ? '/' : '/onboarding');
        } else {
          router.replace('/login');
        }
      } catch {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-600">Completing sign-in...</p>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-600">Completing sign-in...</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
