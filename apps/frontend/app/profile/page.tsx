'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, type AuthUser } from '@/lib/auth';
import { getProfileFields } from '@/lib/fieldLock';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
      setUser(data.user);
      setPhone(data.user.phone || '');
    }

    loadUser().catch(() => router.replace('/login'));
  }, [router]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token || !user) return;

    setError('');
    setNotice('');
    if (!/^\d{10}$/.test(phone)) {
      setError('Please enter a 10-digit phone number.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone }),
      });

      if (res.status === 404) {
        setNotice(
          'Editing is not available yet — this will be enabled once the update-profile API ships.'
        );
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to update your phone number.');
        return;
      }

      setUser(data.user);
      setNotice('Phone number updated.');
    } catch {
      setError('Unable to connect to the server. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) {
    return <main className="flex min-h-screen items-center justify-center">Loading profile…</main>;
  }

  const fields = getProfileFields(user);

  return (
    <main className="flex min-h-screen items-center justify-center bg-pink-100 p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow"
      >
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My profile</h1>
          <p className="mt-1 text-sm text-gray-600">
            Locked fields are managed by the university/CU LibSpace and can&apos;t be edited here.
          </p>
        </div>

        {fields.map((field) =>
          field.editable ? (
            <label key={field.key} className="block text-sm font-medium text-gray-700">
              {field.label}
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
          ) : (
            <div key={field.key} className="block text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1">
                {field.label}
                <span aria-hidden="true" title="Read-only">
                  🔒
                </span>
              </span>
              <p className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500">
                {field.value || '—'}
              </p>
            </div>
          )
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-amber-600">{notice}</p>}
        <button
          disabled={isSaving}
          className="w-full rounded-md bg-rose-500 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </main>
  );
}
