'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, type AuthUser } from '@/lib/auth';
import { getExtraIdFields, getProfileFields } from '@/lib/fieldLock';

type ProfileContentProps = {
  /** Shown as an ✕ button in the header when provided (modal usage). */
  onClose?: () => void;
};

export default function ProfileContent({ onClose }: ProfileContentProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [phone, setPhone] = useState('');
  // Tracks the last-saved values so the submit button only shows up once
  // something actually differs from them.
  const [savedValues, setSavedValues] = useState({ firstname: '', lastname: '', phone: '' });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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
      setFirstname(data.user.firstname);
      setLastname(data.user.lastname);
      setPhone(data.user.phone || '');
      setSavedValues({
        firstname: data.user.firstname,
        lastname: data.user.lastname,
        phone: data.user.phone || '',
      });
    }

    loadUser().catch(() => router.replace('/login'));
  }, [router]);

  const hasChanges =
    firstname !== savedValues.firstname ||
    lastname !== savedValues.lastname ||
    phone !== savedValues.phone;

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token || !user || !hasChanges) return;

    setError('');
    setNotice('');
    if (!firstname.trim() || !lastname.trim()) {
      setError('First name and last name cannot be empty.');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      setError('Please enter a 10-digit phone number.');
      return;
    }

    setIsSaving(true);
    try {
      // Photo upload is still UI-only: the API can set an imageUrl string,
      // but there's no file-storage endpoint yet to turn the local file the
      // user picked into a hosted URL, so it can't be sent along here.
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ firstname, lastname, phone }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Unable to update your profile.');
        return;
      }

      setUser(data.user);
      setSavedValues({
        firstname: data.user.firstname,
        lastname: data.user.lastname,
        phone: data.user.phone || '',
      });
      setNotice('Profile updated.');
    } catch {
      setError('Unable to connect to the server. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="flex h-64 w-full max-w-3xl items-center justify-center rounded-xl bg-white p-8 shadow">
        Loading profile…
      </div>
    );
  }

  const fields = getProfileFields(user);
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  const extraFields = getExtraIdFields(user);
  const score = user.behaviourScore ?? 100;
  const scoreColor = score >= 50 ? 'bg-emerald-500' : 'bg-red-500';

  return (
    <form
      onSubmit={handleSave}
      className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow"
    >
      <div className="relative bg-pink-400 py-6 text-center">
        <h1 className="text-2xl font-semibold text-white">My Profile</h1>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-white/90 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ✕
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 p-8 sm:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-100 text-sm text-gray-500 hover:bg-gray-200"
          >
            {photoPreview || user.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview || user.imageUrl || undefined}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              'Upload photo'
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <p className="text-center text-xs text-gray-400">
            Photo upload is a preview only — saving isn&apos;t supported yet.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              First name
              <input
                value={firstname}
                onChange={(event) => setFirstname(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Last name
              <input
                value={lastname}
                onChange={(event) => setLastname(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                required
              />
            </label>
            <div className="block text-sm font-medium text-gray-700">
              User Type
              <p className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500">
                {byKey.userType.value || '—'}
              </p>
            </div>
            <label className="block text-sm font-medium text-gray-700">
              Phone
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
          </div>

          <div className="block text-sm font-medium text-gray-700">
            Email
            <p className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500">
              {byKey.email.value}
            </p>
          </div>

          {extraFields.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {extraFields.map((field) => (
                <div key={field.key} className="block text-sm font-medium text-gray-700">
                  {field.label}
                  <p className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500">
                    {field.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-sm font-medium text-gray-700">
              <span>Behaviour Score</span>
              <span className="text-xs text-gray-400">[ view history ]</span>
            </div>
            <div className="relative mt-1 h-6 w-full overflow-hidden rounded-full bg-red-500">
              <div
                className={`h-full ${scoreColor}`}
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-semibold text-white">
                {score}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pb-8">
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {notice && <p className="mb-3 text-sm text-amber-600">{notice}</p>}
        {hasChanges && (
          <button
            disabled={isSaving}
            className="w-full rounded-md bg-rose-500 px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Confirm Update'}
          </button>
        )}
      </div>
    </form>
  );
}
