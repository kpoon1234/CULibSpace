'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL, getAuthToken, saveAuth, type AuthUser } from '@/lib/auth';

type IdentityType = 'THAI' | 'FOREIGN';

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [phone, setPhone] = useState('');
  const [identityType, setIdentityType] = useState<IdentityType>('THAI');
  const [identityValue, setIdentityValue] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    async function loadUser() {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        router.replace('/login');
        return;
      }

      const data = (await res.json()) as { user: AuthUser };
      if (data.user.isProfileComplete) {
        router.replace('/');
        return;
      }
      setUser(data.user);
    }

    loadUser().catch(() => router.replace('/login'));
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token || !user) return;

    setError('');
    if (!/^\d{10}$/.test(phone)) {
      setError('Please enter a 10-digit phone number.');
      return;
    }
    if (user.userType !== 'UNIVERSITY') {
      const pattern = identityType === 'THAI' ? /^\d{13}$/ : /^[A-Za-z0-9]{9}$/;
      if (!pattern.test(identityValue)) {
        setError(
          identityType === 'THAI'
            ? 'Citizen ID must contain exactly 13 digits.'
            : 'Passport ID must contain exactly 9 letters or digits.'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload =
        user.userType === 'UNIVERSITY'
          ? { phone }
          : {
              phone,
              identityType,
              ...(identityType === 'THAI'
                ? { citizenId: identityValue }
                : { passportId: identityValue }),
            };
      const res = await fetch(`${API_URL}/api/auth/complete-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to complete your profile.');
        return;
      }

      saveAuth(data.token, data.user);
      router.replace('/');
    } catch {
      setError('Unable to connect to the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return <main className="flex min-h-screen items-center justify-center">Loading profile…</main>;
  }

  const isUniversityUser = user.userType === 'UNIVERSITY';
  return (
    <main className="flex min-h-screen items-center justify-center bg-pink-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow"
      >
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Complete your profile</h1>
          <p className="mt-1 text-sm text-gray-600">
            Welcome, {user.firstname}.{' '}
            {isUniversityUser
              ? 'Add your contact phone number.'
              : 'Add your phone number and one identity document.'}
          </p>
        </div>

        <label className="block text-sm font-medium text-gray-700">
          Phone number
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            maxLength={10}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black"
            placeholder="0812345678"
            required
          />
        </label>

        {!isUniversityUser && (
          <>
            <fieldset>
              <legend className="text-sm font-medium text-gray-700">Identity document</legend>
              <div className="mt-2 flex gap-4 text-sm text-gray-700">
                <label>
                  <input
                    type="radio"
                    checked={identityType === 'THAI'}
                    onChange={() => {
                      setIdentityType('THAI');
                      setIdentityValue('');
                    }}
                  />{' '}
                  Thai citizen ID
                </label>
                <label>
                  <input
                    type="radio"
                    checked={identityType === 'FOREIGN'}
                    onChange={() => {
                      setIdentityType('FOREIGN');
                      setIdentityValue('');
                    }}
                  />{' '}
                  Passport
                </label>
              </div>
            </fieldset>
            <label className="block text-sm font-medium text-gray-700">
              {identityType === 'THAI' ? 'Citizen ID' : 'Passport ID'}
              <input
                value={identityValue}
                onChange={(event) => setIdentityValue(event.target.value)}
                maxLength={identityType === 'THAI' ? 13 : 9}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                required
              />
            </label>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={isSubmitting}
          className="w-full rounded-md bg-rose-500 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </main>
  );
}
