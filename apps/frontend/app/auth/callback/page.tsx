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

        if (!res.ok) {
          router.replace('/login');
          return;
        }

        const data = (await res.json()) as { user: AuthUser };
        const user = data.user;

        // Check for pending consent saved from login page before Google redirect (Must Fix 3)
        let pendingConsent: { consent: boolean; version?: string } | null = null;
        try {
          const raw = sessionStorage.getItem('culibspace_pending_consent');
          if (raw) {
            pendingConsent = JSON.parse(raw);
          }
        } catch {
          pendingConsent = null;
        }

        if (pendingConsent?.consent) {
          try {
            await fetch(`${API_URL}/api/auth/consent`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              credentials: 'include',
              body: JSON.stringify({
                consent: true,
                consentVersion: pendingConsent.version || '2026-11',
              }),
            });
            sessionStorage.removeItem('culibspace_pending_consent');
          } catch (e) {
            console.error('[auth/callback] Failed to record consent:', e);
          }
        } else if (!user.consentedAt) {
          // If the user has never consented and did not check the boxes, redirect to consent error
          router.replace('/login?error=consent_required');
          return;
        }

        if (token) saveAuth(token, user);
        router.replace(user.isProfileComplete ? '/' : '/onboarding');
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
