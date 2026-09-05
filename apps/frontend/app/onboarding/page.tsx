'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, saveAuth, type AuthUser } from '@/lib/auth';

type IdentityType = 'THAI' | 'FOREIGN';

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
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

  // Real-time validation checks for the submit button
  const isUniversityUser = user?.userType === 'UNIVERSITY';
  const isPhoneValid = /^\d{10}$/.test(phone);
  const isIdentityValid =
    isUniversityUser ||
    (identityType === 'THAI'
      ? /^\d{13}$/.test(identityValue)
      : /^[A-Za-z0-9]{9}$/.test(identityValue));

  const isFormValid =
    firstname.trim() !== '' && lastname.trim() !== '' && isPhoneValid && isIdentityValid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isFormValid) return; // Failsafe if forced

    const token = getAuthToken();
    if (!token || !user) return;

    setError('');
    setIsSubmitting(true);

    try {
      const payload = isUniversityUser
        ? {
            firstname: firstname.trim(),
            lastname: lastname.trim(),
            phone,
          }
        : {
            firstname: firstname.trim(),
            lastname: lastname.trim(),
            phone,
            identityType,
            ...(identityType === 'THAI'
              ? { citizenId: identityValue }
              : { passportId: identityValue }),
          };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/complete-profile`, {
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-pink-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow"
      >
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Complete your profile</h1>
          <p className="mt-1 text-sm text-gray-600">
            Please enter your legal name and{' '}
            {isUniversityUser
              ? 'your contact phone number.'
              : 'your phone number and one identity document.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-gray-700">
            First name <span className="text-red-500">*</span>
            <input
              value={firstname}
              onChange={(e) => setFirstname(e.target.value)}
              placeholder="e.g. Kaopoon"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black focus:border-rose-400 focus:outline-none"
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Last name <span className="text-red-500">*</span>
            <input
              value={lastname}
              onChange={(e) => setLastname(e.target.value)}
              placeholder="e.g. Ruksuan"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black focus:border-rose-400 focus:outline-none"
              required
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-gray-700">
          Phone number <span className="text-red-500">*</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            maxLength={10}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black focus:border-rose-400 focus:outline-none"
            placeholder="e.g. 0812345678"
            required
          />
        </label>

        {!isUniversityUser && (
          <>
            <fieldset>
              <legend className="text-sm font-medium text-gray-700">
                Identity document <span className="text-red-500">*</span>
              </legend>
              <div className="mt-2 flex gap-4 text-sm text-gray-700">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={identityType === 'THAI'}
                    onChange={() => {
                      setIdentityType('THAI');
                      setIdentityValue('');
                    }}
                  />
                  Thai citizen ID
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={identityType === 'FOREIGN'}
                    onChange={() => {
                      setIdentityType('FOREIGN');
                      setIdentityValue('');
                    }}
                  />
                  Passport
                </label>
              </div>
            </fieldset>
            <label className="block text-sm font-medium text-gray-700">
              {identityType === 'THAI' ? 'Citizen ID (13 digits)' : 'Passport ID (9 characters)'}{' '}
              <span className="text-red-500">*</span>
              <input
                value={identityValue}
                onChange={(event) => setIdentityValue(event.target.value)}
                maxLength={identityType === 'THAI' ? 13 : 9}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black focus:border-rose-400 focus:outline-none"
                required
              />
            </label>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Button is disabled unless all fields strictly meet their format requirements */}
        <button
          disabled={isSubmitting || !isFormValid}
          className="w-full rounded-md bg-rose-500 px-4 py-2 font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </main>
  );
}
