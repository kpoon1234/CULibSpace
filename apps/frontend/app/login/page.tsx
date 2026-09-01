'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ForgotPassword from './../../components/Login/ForgotPassword';
import { GoogleIcon } from '@/components/Login/Customicons';

type Role = 'user' | 'admin';

export default function LogIn() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)] bg-pink-100" />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const isSignupIntent = searchParams.get('intent') === 'signup';
  const [role, setRole] = useState<Role>('user');
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');
  const [visitorEmailError, setVisitorEmailError] = useState(false);
  const [visitorEmailErrorMessage, setVisitorEmailErrorMessage] = useState('');
  const [visitorPasswordError, setVisitorPasswordError] = useState(false);
  const [visitorPasswordErrorMessage, setVisitorPasswordErrorMessage] = useState('');
  const [open, setOpen] = useState(false);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateInputs()) return;

    const data = new FormData(event.currentTarget);
    const payload = {
      email: data.get('email'),
      password: data.get('password'),
    };

    // ยิงคนละ endpoint ตาม role ที่เลือก — backend เป็นคนเช็คเองว่าอีเมลที่ login มาเป็นของมหาลัยหรือภายนอก
    const endpoint = role === 'admin' ? '/api/admin/login' : '/api/login';
    console.log(endpoint, payload);
  };

  const validateVisitorInputs = () => {
    const email = document.getElementById('visitor-email') as HTMLInputElement;
    const password = document.getElementById('visitor-password') as HTMLInputElement;

    let isValid = true;

    if (!email.value || !/\S+@\S+\.\S+/.test(email.value)) {
      setVisitorEmailError(true);
      setVisitorEmailErrorMessage('Please enter a valid email address.');
      isValid = false;
    } else {
      setVisitorEmailError(false);
      setVisitorEmailErrorMessage('');
    }

    if (!password.value || password.value.length < 6) {
      setVisitorPasswordError(true);
      setVisitorPasswordErrorMessage('Password must be at least 6 characters long.');
      isValid = false;
    } else {
      setVisitorPasswordError(false);
      setVisitorPasswordErrorMessage('');
    }

    return isValid;
  };

  const handleVisitorSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateVisitorInputs()) return;

    const data = new FormData(event.currentTarget);
    const payload = {
      email: data.get('email'),
      password: data.get('password'),
    };

    console.log('/api/login', payload);
  };

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-between bg-pink-100 p-4 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 50% 50%, hsl(210, 100%, 97%), hsl(0, 0%, 100%))',
        }}
      />

      <div className="my-auto flex w-full max-w-[450px] flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-[0_5px_15px_0_hsla(220,30%,5%,0.05),0_15px_35px_-5px_hsla(220,25%,10%,0.05)]">
        <h1 className="w-full text-[clamp(2rem,10vw,2.15rem)] font-semibold text-gray-900">
          {role === 'admin' ? 'Admin Login' : isSignupIntent ? 'Get Started' : 'Login'}
        </h1>
        {role === 'user' && isSignupIntent && (
          <p className="-mt-2 text-sm text-gray-600">
            New here? Continue below to create your account.
          </p>
        )}

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
                className={`text-black w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 placeholder:text-gray-400 ${
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
                className={`text-black w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 placeholder:text-gray-400 ${
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
              className="w-full rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
            >
              Login as Admin
            </button>

            <button
              type="button"
              onClick={handleClickOpen}
              className="self-center text-sm text-rose-600 hover:underline"
            >
              Forgot your password?
            </button>
          </form>
        ) : (
          <div className="flex w-full flex-col gap-4">
            <form onSubmit={handleVisitorSubmit} noValidate className="flex w-full flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="visitor-email" className="text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="visitor-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  required
                  className={`text-black w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 placeholder:text-gray-400 ${
                    visitorEmailError
                      ? 'border-red-500 focus:ring-red-200'
                      : 'border-gray-300 focus:ring-rose-200'
                  }`}
                />
                {visitorEmailError && (
                  <p className="text-xs text-red-600">{visitorEmailErrorMessage}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="visitor-password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="visitor-password"
                  name="password"
                  type="password"
                  placeholder="••••••"
                  autoComplete="current-password"
                  required
                  className={`text-black w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 placeholder:text-gray-400 ${
                    visitorPasswordError
                      ? 'border-red-500 focus:ring-red-200'
                      : 'border-gray-300 focus:ring-rose-200'
                  }`}
                />
                {visitorPasswordError && (
                  <p className="text-xs text-red-600">{visitorPasswordErrorMessage}</p>
                )}
              </div>

              <button
                type="submit"
                onClick={validateVisitorInputs}
                className="w-full rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
              >
                Sign in
              </button>
            </form>

            <div className="flex flex-col items-center gap-2 rounded-md bg-gray-50 p-3">
              <p className="text-xs text-gray-600">or continue with</p>
              <a
                href="/api/auth/google"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100"
              >
                <GoogleIcon />
                Google
              </a>
            </div>
          </div>
        )}
      </div>

      <ForgotPassword open={open} handleClose={handleClose} />
    </div>
  );
}
