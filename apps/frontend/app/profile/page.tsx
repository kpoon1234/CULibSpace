'use client';

import Image from 'next/image';

export default function ProfilePage() {
  // Mock user data (Replace with dynamic session/API data as needed)
  const user = {
    name: 'Somchai Jaidee',
    email: 'somchai.j@chula.ac.th',
    description: 'Computer Engineering student who loves quiet study spots near windows.',
    behaviorScore: 95,
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop',
    stats: [
      { label: 'Total Reservations', value: 24 },
      { label: 'Active Reservations', value: 1 },
      { label: 'Hours Studied', value: '48 hrs' },
      { label: 'Favorite Library', value: 'Main Library 3F' },
    ],
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-pink-100 p-4 sm:p-8 flex flex-col justify-between">
      {/* Main Content Area */}
      <main className="mx-auto my-auto w-full max-w-5xl py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 items-start">
          {/* Left Column: Profile Card (1, 2, 4) */}
          <div className="relative flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm mt-12 md:mt-0">
            {/* 1. Profile Picture (Overlapping top) */}
            <div className="absolute -top-12 h-24 w-24 overflow-hidden rounded-full border-4 border-white shadow-md">
              <Image
                src={user.avatarUrl}
                alt={user.name}
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            </div>

            {/* Profile Header Info */}
            <div className="mt-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>

            {/* 2. Description */}
            <div className="mt-4 w-full rounded-lg bg-gray-50 p-3 text-center text-sm text-gray-600">
              <p>{user.description}</p>
            </div>

            {/* 4. Behavior Score (0 - 100) */}
            <div className="mt-6 w-full rounded-lg border border-rose-100 bg-rose-50/50 p-4">
              <div className="flex items-center justify-between text-sm font-semibold text-gray-800">
                <span>Behavior Score</span>
                <span className="text-rose-600 font-bold">{user.behaviorScore} / 100</span>
              </div>

              {/* Progress Bar */}
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${user.behaviorScore}%` }}
                />
              </div>
              <p className="mt-2 text-center text-[11px] text-gray-500">
                Maintain above 80 to keep priority reservation perks.
              </p>
            </div>
          </div>

          {/* Right Column: Information Cards (3) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:col-span-2">
            {user.stats.map((stat, index) => (
              <div
                key={index}
                className="flex flex-col justify-between min-h-[140px] rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="text-sm font-medium text-gray-500">{stat.label}</span>
                <span className="text-3xl font-bold text-gray-900">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ========================================== */}
      {/* FOOTER PLACEHOLDER (Reserved space for footer) */}
      {/* ========================================== */}
      {/* <footer className="w-full border-t border-gray-200 py-4 text-center text-xs text-gray-500">
            © 2026 Library Table Reservation System. All rights reserved.
          </footer> */}
    </div>
  );
}
