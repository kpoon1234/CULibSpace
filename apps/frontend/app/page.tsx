'use client';

import { useState } from 'react';

export default function Home() {
  const [responseMessage, setResponseMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const handleFetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/hello`);
      const data = await res.json();
      setResponseMessage(data.message);
    } catch (error) {
      setResponseMessage('❌ Failed to connect to Backend Server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-black font-sans">
      <div className="flex flex-col items-center gap-6 p-8 bg-white dark:bg-zinc-900 rounded-xl shadow-md border border-zinc-200 dark:border-zinc-800 max-w-md w-full">
        <h1 className="text-xl font-bold text-black dark:text-white">API Connection Test</h1>

        <button
          onClick={handleFetchData}
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Calling API...' : 'Get Message from Backend'}
        </button>

        {responseMessage && (
          <div className="w-full p-4 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-center">
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
              Backend Response:
            </p>
            <p className="text-base font-medium text-zinc-800 dark:text-zinc-100">
              {responseMessage}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
