'use client';

import { useState, FormEvent, Suspense } from 'react';
import ForgotPassword from './../../components/Login/ForgotPassword';
import { GoogleIcon } from '@/components/Login/Customicons';
import { API_URL, saveAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

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
  const [role, setRole] = useState<Role>('user');
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');
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
      router.replace('/');
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
          <a
            href={`${API_URL}/api/auth/google`}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
          >
            <GoogleIcon />
            Sign in with Google
          </a>
        )}
      </div>

      <ForgotPassword open={open} handleClose={handleClose} />
    </div>
  );
}
