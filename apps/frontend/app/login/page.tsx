'use client';

import { useState, FormEvent, Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import ForgotPassword from './../../components/Login/ForgotPassword';
import { GoogleIcon } from '@/components/Login/Customicons';
import { TermsContent } from '@/components/Legal/TermsContent';
import { PdpaContent } from '@/components/Legal/PdpaContent';
import {
  API_URL,
  CURRENT_CONSENT_VERSION,
  saveAuth,
  getAuthToken,
  getStoredUser,
  clearAuth,
  verifyStoredSession,
} from '@/lib/auth';
import { useRouter, useSearchParams } from 'next/navigation';

type Role = 'user' | 'admin';

export default function LogIn() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)] bg-canvas" />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [role, setRole] = useState<Role>('user');
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [pdpa, setPdpa] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPdpa, setShowPdpa] = useState(false);

  // References for focus management (Should Fix 9)
  const termsTriggerRef = useRef<HTMLButtonElement>(null);
  const pdpaTriggerRef = useRef<HTMLButtonElement>(null);
  const termsCloseRef = useRef<HTMLButtonElement>(null);
  const pdpaCloseRef = useRef<HTMLButtonElement>(null);

  // Derive error from URL without calling setState in useEffect (Must Fix 4)
  const isConsentRequired = searchParams.get('error') === 'consent_required';
  const activeConsentError =
    consentError !== null
      ? consentError
      : isConsentRequired
        ? 'Please review and accept the Terms of Service and PDPA policy before signing in.'
        : '';

  // Escape key and focus handling for modals
  useEffect(() => {
    if (!showTerms && !showPdpa) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showTerms) {
          setShowTerms(false);
          termsTriggerRef.current?.focus();
        }
        if (showPdpa) {
          setShowPdpa(false);
          pdpaTriggerRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTerms, showPdpa]);

  useEffect(() => {
    if (showTerms) {
      termsCloseRef.current?.focus();
    }
  }, [showTerms]);

  useEffect(() => {
    if (showPdpa) {
      pdpaCloseRef.current?.focus();
    }
  }, [showPdpa]);

  useEffect(() => {
    const token = getAuthToken();
    const user = getStoredUser();
    if (!token || !user) return;

    // Only send an already-signed-in user away if their session still works.
    let cancelled = false;
    void verifyStoredSession().then((result) => {
      if (cancelled) return;
      if (result === 'invalid') {
        clearAuth();
        return;
      }
      if (user.role === 'ADMIN') {
        router.replace('/admin');
      } else {
        router.replace(user.isProfileComplete ? '/' : '/onboarding');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleClickOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const validateInputs = () => {
    const email = document.getElementById('email') as HTMLInputElement;
    const password = document.getElementById('password') as HTMLInputElement;

    let isValid = true;

    if (!email.value || !/\S+@\S+\.\S+/.test(email.value)) {
      setEmailError(true);
      setEmailErrorMessage('Please enter a valid email address.');
      isValid = false;
    } else {
      setEmailError(false);
      setEmailErrorMessage('');
    }

    if (!password.value || password.value.length < 6) {
      setPasswordError(true);
      setPasswordErrorMessage('Password must be at least 6 characters long.');
      isValid = false;
    } else {
      setPasswordError(false);
      setPasswordErrorMessage('');
    }

    return isValid;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateInputs()) return;

    const data = new FormData(event.currentTarget);
    const payload = {
      email: data.get('email'),
      password: data.get('password'),
    };

    if (role !== 'admin') return;

    try {
      const response = await fetch(`${API_URL}/api/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setPasswordError(true);
        setPasswordErrorMessage(result.error || 'Incorrect username or password.');
        return;
      }
      saveAuth(result.token, result.user);
      router.replace('/admin');
    } catch {
      setPasswordError(true);
      setPasswordErrorMessage('Unable to connect to the server.');
    }
  };

  const handleGoogleSignIn = () => {
    if (!consent || !pdpa) {
      setConsentError('Please review and check both boxes before signing in.');
      return;
    }

    // Save consent intention to sessionStorage for verification after OAuth callback (Must Fix 3)
    try {
      sessionStorage.setItem(
        'culibspace_pending_consent',
        JSON.stringify({ consent: true, version: CURRENT_CONSENT_VERSION, timestamp: Date.now() })
      );
    } catch {
      // Ignore sessionStorage restrictions
    }

    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${API_URL}/api/auth/google?consent=true`;
  };

  const closeTermsModal = () => {
    setShowTerms(false);
    termsTriggerRef.current?.focus();
  };

  const closePdpaModal = () => {
    setShowPdpa(false);
    pdpaTriggerRef.current?.focus();
  };

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-between bg-canvas p-4 sm:p-8">
      <div className="my-auto flex w-full max-w-[450px] flex-col gap-4 rounded-xl border border-gray-200 bg-paper p-8 shadow-[0_5px_15px_0_hsla(220,30%,5%,0.05),0_15px_35px_-5px_hsla(220,25%,10%,0.05)]">
        <h1 className="w-full text-[clamp(2rem,10vw,2.15rem)] font-semibold text-gray-900">
          {role === 'admin' ? 'Admin Login' : 'Login'}
        </h1>

        {/* Role tabs */}
        <div className="flex rounded-md bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setRole('user')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              role === 'user' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            User
          </button>
          <button
            type="button"
            onClick={() => setRole('admin')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              role === 'admin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Admin
          </button>
        </div>

        {role === 'admin' ? (
          <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="admin@chula.ac.th"
                autoComplete="email"
                autoFocus
                required
                className={`text-ink w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 placeholder:text-gray-500 ${
                  emailError
                    ? 'border-red-500 focus:ring-red-200'
                    : 'border-gray-300 focus:ring-rose-200'
                }`}
              />
              {emailError && <p className="text-xs text-red-600">{emailErrorMessage}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••"
                autoComplete="current-password"
                required
                className={`text-ink w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 placeholder:text-gray-500 ${
                  passwordError
                    ? 'border-red-500 focus:ring-red-200'
                    : 'border-gray-300 focus:ring-rose-200'
                }`}
              />
              {passwordError && <p className="text-xs text-red-600">{passwordErrorMessage}</p>}
            </div>

            <button
              type="submit"
              onClick={validateInputs}
              className="w-full rounded-md bg-chula-pink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-chula-pink-hover"
            >
              Login as Admin
            </button>

            <button
              type="button"
              onClick={handleClickOpen}
              className="self-center text-sm text-chula-pink hover:underline"
            >
              Forgot your password?
            </button>
          </form>
        ) : (
          <>
            <div className="panel-muted rounded-md border border-gray-200 bg-gray-50 p-3 flex flex-col gap-2">
              <p className="text-xs text-gray-600 leading-relaxed">
                Before signing in with Google, please review and accept:
              </p>
              {activeConsentError && (
                <p className="text-xs font-medium text-red-600">{activeConsentError}</p>
              )}
              <div className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                <input
                  type="checkbox"
                  id="consent-terms"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    setConsentError('');
                  }}
                  className="mt-0.5 shrink-0 cursor-pointer"
                />
                <span>
                  <label htmlFor="consent-terms" className="cursor-pointer">
                    I consent to the{' '}
                  </label>
                  <button
                    type="button"
                    ref={termsTriggerRef}
                    onClick={() => setShowTerms(true)}
                    className="text-claret-600 hover:text-claret-700 underline font-medium p-0 cursor-pointer inline"
                  >
                    Terms of Service
                  </button>
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                <input
                  type="checkbox"
                  id="consent-pdpa"
                  checked={pdpa}
                  onChange={(e) => {
                    setPdpa(e.target.checked);
                    setConsentError('');
                  }}
                  className="mt-0.5 shrink-0 cursor-pointer"
                />
                <span>
                  <label htmlFor="consent-pdpa" className="cursor-pointer">
                    I agree to the{' '}
                  </label>
                  <button
                    type="button"
                    ref={pdpaTriggerRef}
                    onClick={() => setShowPdpa(true)}
                    className="text-claret-600 hover:text-claret-700 underline font-medium p-0 cursor-pointer inline"
                  >
                    Personal Data Protection Act (PDPA)
                  </button>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className={`flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                consent && pdpa
                  ? 'border-gray-300 text-gray-800 hover:bg-gray-100'
                  : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </>
        )}
      </div>

      <ForgotPassword open={open} handleClose={handleClose} />

      {/* Terms of Service Modal (Should Fix 7 & 9) */}
      {showTerms && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={closeTermsModal}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 id="terms-dialog-title" className="text-lg font-semibold text-gray-900">
                Terms of Service
              </h2>
              <button
                type="button"
                ref={termsCloseRef}
                onClick={closeTermsModal}
                className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
            <TermsContent lang="en" />
            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
              Read the full version on the{' '}
              <Link
                href="/terms-of-service"
                target="_blank"
                className="text-claret-600 underline font-medium hover:text-claret-700"
              >
                Terms of Service page
              </Link>
              .
            </div>
          </div>
        </div>
      )}

      {/* PDPA Modal (Should Fix 6, 7 & 9) */}
      {showPdpa && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pdpa-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={closePdpaModal}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 id="pdpa-dialog-title" className="text-lg font-semibold text-gray-900">
                Personal Data Protection Act (PDPA)
              </h2>
              <button
                type="button"
                ref={pdpaCloseRef}
                onClick={closePdpaModal}
                className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
            <PdpaContent lang="en" />
            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
              Read the full version on the{' '}
              <Link
                href="/pdpa"
                target="_blank"
                className="text-claret-600 underline font-medium hover:text-claret-700"
              >
                PDPA Policy page
              </Link>
              .
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
