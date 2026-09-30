'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, getStoredUser, saveAuth, type AuthUser } from '@/lib/auth';
import { API_URL } from '@/lib/auth';

type IdentityType = 'THAI' | 'FOREIGN';

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  const [firstname, setFirstname] = useState(() => {
    if (typeof window === 'undefined') return '';
    const su = getStoredUser();
    return su?.firstname || '';
  });
  const [lastname, setLastname] = useState(() => {
    if (typeof window === 'undefined') return '';
    const su = getStoredUser();
    return su?.lastname || '';
  });
  const [phone, setPhone] = useState(() => {
    if (typeof window === 'undefined') return '';
    const su = getStoredUser();
    return su?.phone || '';
  });
  const [identityType, setIdentityType] = useState<IdentityType>('THAI');
  const [identityValue, setIdentityValue] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});
  const [duplicateErrors, setDuplicateErrors] = useState<{ phone?: string; identity?: string }>({});
  const [serverError, setServerError] = useState('');
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
      // Prefill Google name as default while preserving any edits made by the user
      setFirstname((prev) => prev || data.user.firstname || '');
      setLastname((prev) => prev || data.user.lastname || '');
      if (data.user.phone) {
        setPhone((prev) => prev || data.user.phone || '');
      }
    }

    loadUser().catch(() => router.replace('/login'));
  }, [router]);

  const isUniversityUser = user?.userType === 'UNIVERSITY';

  // Field validation rules
  const firstnameError = !firstname.trim() ? 'First name is required.' : '';
  const lastnameError = !lastname.trim() ? 'Last name is required.' : '';

  const isPhone10Digits = /^\d{10}$/.test(phone);
  const phoneError =
    duplicateErrors.phone ||
    (!phone
      ? 'Phone number is required.'
      : !isPhone10Digits
        ? 'Please enter a valid 10-digit phone number.'
        : '');

  let identityError = duplicateErrors.identity || '';
  if (!isUniversityUser && !duplicateErrors.identity) {
    if (!identityValue.trim()) {
      identityError =
        identityType === 'THAI' ? 'Citizen ID is required.' : 'Passport ID is required.';
    } else if (identityType === 'THAI' && !/^\d{13}$/.test(identityValue)) {
      identityError = 'Citizen ID must contain exactly 13 digits.';
    } else if (identityType === 'FOREIGN' && !/^[A-Za-z0-9]{9}$/.test(identityValue)) {
      identityError = 'Passport ID must contain exactly 9 letters or digits.';
    }
  }

  const isFormValid =
    !firstnameError && !lastnameError && !phoneError && (isUniversityUser || !identityError);

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSubmitted(true);

    if (!isFormValid) {
      return;
    }

    const token = getAuthToken();
    if (!token || !user) return;

    setServerError('');
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
        const errorMsg = data.error || 'Unable to complete your profile.';
        if (
          errorMsg.includes('already exists') ||
          errorMsg.includes('identity') ||
          data.field === 'identity'
        ) {
          setDuplicateErrors((prev) => ({
            ...prev,
            identity: 'An account with this ID already exists.',
          }));
        } else if (
          errorMsg.includes('phone') ||
          errorMsg.includes('registered') ||
          data.field === 'phone'
        ) {
          setDuplicateErrors((prev) => ({
            ...prev,
            phone: 'This phone number is already registered to another account.',
          }));
        } else {
          setServerError(errorMsg);
        }
        return;
      }

      saveAuth(data.token, data.user);
      router.replace('/');
    } catch {
      setServerError('Unable to connect to the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return <main className="flex min-h-screen items-center justify-center">Loading profile…</main>;
  }

  const showFirstnameError = (hasSubmitted || touched.firstname) && Boolean(firstnameError);
  const showLastnameError = (hasSubmitted || touched.lastname) && Boolean(lastnameError);
  const showPhoneError = (hasSubmitted || touched.phone) && Boolean(phoneError);
  const showIdentityError = (hasSubmitted || touched.identity) && Boolean(identityError);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 sm:p-8">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-md space-y-5 rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
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
          <div>
            <label className="block text-sm font-medium text-gray-700">
              First name <span className="text-red-500">*</span>
              <input
                value={firstname}
                onChange={(e) => {
                  setFirstname(e.target.value);
                }}
                onBlur={() => markTouched('firstname')}
                placeholder="e.g. Kaopoon"
                className={`mt-1 w-full rounded-md border px-3 py-2 text-black outline-none transition-colors ${
                  showFirstnameError
                    ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                    : 'border-gray-300 focus:border-rose-400'
                }`}
                required
              />
            </label>
            {showFirstnameError && <p className="mt-1 text-xs text-red-600">{firstnameError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Last name <span className="text-red-500">*</span>
              <input
                value={lastname}
                onChange={(e) => {
                  setLastname(e.target.value);
                }}
                onBlur={() => markTouched('lastname')}
                placeholder="e.g. Ruksuan"
                className={`mt-1 w-full rounded-md border px-3 py-2 text-black outline-none transition-colors ${
                  showLastnameError
                    ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                    : 'border-gray-300 focus:border-rose-400'
                }`}
                required
              />
            </label>
            {showLastnameError && <p className="mt-1 text-xs text-red-600">{lastnameError}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Phone number <span className="text-red-500">*</span>
            <input
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value.replace(/\D/g, ''));
                if (duplicateErrors.phone) {
                  setDuplicateErrors((prev) => ({ ...prev, phone: undefined }));
                }
              }}
              onBlur={() => markTouched('phone')}
              inputMode="numeric"
              maxLength={10}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-black outline-none transition-colors ${
                showPhoneError
                  ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-gray-300 focus:border-rose-400'
              }`}
              placeholder="e.g. 0812345678"
              required
            />
          </label>
          {showPhoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
        </div>

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
                      setDuplicateErrors((prev) => ({ ...prev, identity: undefined }));
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
                      setDuplicateErrors((prev) => ({ ...prev, identity: undefined }));
                    }}
                  />
                  Passport
                </label>
              </div>
            </fieldset>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                {identityType === 'THAI' ? 'Citizen ID (13 digits)' : 'Passport ID (9 characters)'}{' '}
                <span className="text-red-500">*</span>
                <input
                  value={identityValue}
                  onChange={(event) => {
                    setIdentityValue(event.target.value);
                    if (duplicateErrors.identity) {
                      setDuplicateErrors((prev) => ({ ...prev, identity: undefined }));
                    }
                  }}
                  onBlur={() => markTouched('identity')}
                  maxLength={identityType === 'THAI' ? 13 : 9}
                  className={`mt-1 w-full rounded-md border px-3 py-2 text-black outline-none transition-colors ${
                    showIdentityError
                      ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                      : 'border-gray-300 focus:border-rose-400'
                  }`}
                  required
                />
              </label>
              {showIdentityError && <p className="mt-1 text-xs text-red-600">{identityError}</p>}
            </div>
          </>
        )}

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-chula-pink px-4 py-2.5 font-semibold text-white transition-colors hover:bg-chula-pink-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </main>
  );
}
