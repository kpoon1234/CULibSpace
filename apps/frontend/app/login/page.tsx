'use client';

import { useState, FormEvent, Suspense } from 'react';
import ForgotPassword from './../../components/Login/ForgotPassword';
import { GoogleIcon } from '@/components/Login/Customicons';
import {
  API_URL,
  saveAuth,
  getAuthToken,
  getStoredUser,
  clearAuth,
  verifyStoredSession,
} from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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

  useEffect(() => {
    const token = getAuthToken();
    const user = getStoredUser();
    if (!token || !user) return;

    // Only send an already-signed-in user away if their session still works.
    // A stale token used to bounce visitors straight back out, so a user whose
    // session had expired could never reach this form to sign in again.
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

  const [role, setRole] = useState<Role>('user');
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [pdpa, setPdpa] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPdpa, setShowPdpa] = useState(false);

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
            <div className="panel-muted rounded-md p-3 flex flex-col gap-2">
              <p className="text-xs text-gray-600 leading-relaxed">
                Before signing in with Google, please review and accept:
              </p>
              <div className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                <input
                  type="checkbox"
                  id="consent-terms"
                  checked={consent}
                  onChange={() => setConsent(!consent)}
                  className="mt-0.5 shrink-0"
                />
                <label htmlFor="consent-terms" className="cursor-pointer">
                  I consent to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-claret-600 hover:underline font-medium p-0"
                  >
                    Terms of Service
                  </button>
                </label>
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                <input
                  type="checkbox"
                  id="consent-pdpa"
                  checked={pdpa}
                  onChange={() => setPdpa(!pdpa)}
                  className="mt-0.5 shrink-0"
                />
                <label htmlFor="consent-pdpa" className="cursor-pointer">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowPdpa(true)}
                    className="text-claret-600 hover:underline font-medium p-0"
                  >
                    Personal Data Protection Act (PDPA)
                  </button>
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                if (!consent || !pdpa) {
                  event.preventDefault();
                  return;
                }
                window.location.href = `${API_URL}/api/auth/google`;
              }}
              disabled={!consent || !pdpa}
              className={`flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                consent && pdpa
                  ? 'border-gray-300 text-gray-800 hover:bg-gray-50'
                  : 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </>
        )}
      </div>

      <ForgotPassword open={open} handleClose={handleClose} />

      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowTerms(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Terms of Service</h2>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-4">
              <section>
                <h3 className="text-sm font-semibold text-gray-800">1. Acceptance of Terms</h3>
                <p>
                  By accessing or using CULibSpace, you agree to be bound by these terms. If you do
                  not agree, please discontinue use of this application.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">2. User Eligibility</h3>
                <p>
                  This service is available to Chulalongkorn University students, faculty, and staff
                  with a valid university account, as well as external visitors who register and
                  purchase a valid day-pass ticket.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">
                  3. Seat and Table Reservations
                </h3>
                <p>
                  You may reserve seats or tables online through the system. You must sign in before
                  making a reservation. Each reservation has a set duration and must be cancelled if
                  you do not intend to use it.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">4. User Responsibilities</h3>
                <p>
                  You must keep your password and account credentials confidential and are
                  responsible for all activity under your account. You may not use the system for
                  unlawful or improper purposes.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">5. Cancellation and Changes</h3>
                <p>
                  We reserve the right to change or cancel any reservation at any time as necessary
                  for library operations.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">6. Limitation of Liability</h3>
                <p>
                  CULibSpace shall not be liable for any damages arising from the use or inability
                  to use this system, including damages due to system outages or maintenance.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">7. Contact</h3>
                <p>
                  If you have any questions about these terms, please contact us at
                  contact@culibspace.example or Chulalongkorn University Central Library.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {showPdpa && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowPdpa(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Personal Data Protection Act (PDPA)
              </h2>
              <button
                type="button"
                onClick={() => setShowPdpa(false)}
                className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-4">
              <section>
                <h3 className="text-sm font-semibold text-gray-800">1. Data We Collect</h3>
                <p>
                  We collect personal data you provide when you register or sign in via Google,
                  including your name, surname, email address, profile picture, and phone number.
                  External visitors are additionally required to provide a Thai citizen ID or
                  passport number for identity verification.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">
                  2. Purpose of Data Collection
                </h3>
                <p>
                  To verify your identity, manage seat and table reservations in the library, send
                  booking notifications, process day-pass ticket payments for external visitors, and
                  improve your experience using the CULibSpace application.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">
                  3. Legal Basis for Processing
                </h3>
                <p>
                  We process your data based on your consent and on the performance of a contract
                  for the library seat reservation service.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">
                  4. Disclosure and Transfer of Data
                </h3>
                <p>
                  We will not disclose your personal data to third parties without your consent or
                  as required by law.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">5. Data Subject Rights</h3>
                <p>
                  You have the right to access, rectify, erase, or restrict the processing of your
                  personal data, and the right to object to processing, by contacting us through the
                  channels below.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-800">
                  6. Contact the Data Protection Officer
                </h3>
                <p>
                  If you have any questions or wish to exercise your rights as a data subject,
                  please contact us at contact@culibspace.example or Chulalongkorn University
                  Central Library.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
