'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuthToken, getStoredUser, subscribeToAuth, type AuthUser } from '@/lib/auth';

type AdminTab = 'seats' | 'scores' | 'issues' | 'schedules';

export default function AdminDashboardPage() {
  const router = useRouter();
  const token = useSyncExternalStore(subscribeToAuth, getAuthToken, () => null);
  const [adminUser] = useState<AuthUser | null>(() =>
    typeof window !== 'undefined' ? getStoredUser() : null
  );
  const [activeTab, setActiveTab] = useState<AdminTab>('seats');

  // Interactive mock state for admin seat management demonstration
  const [tables, setTables] = useState([
    { id: 1, name: 'Table S-01', zone: 'Silent', seats: 4, plugCap: 4, status: 'AVAILABLE' },
    { id: 2, name: 'Table S-02', zone: 'Silent', seats: 4, plugCap: 4, status: 'OCCUPIED' },
    { id: 3, name: 'Table G-01', zone: 'Group', seats: 6, plugCap: 6, status: 'RESERVED' },
    { id: 4, name: 'Table G-02', zone: 'Group', seats: 8, plugCap: 8, status: 'CLOSED' },
    { id: 5, name: 'Table C-01', zone: 'Common', seats: 2, plugCap: 2, status: 'AVAILABLE' },
    { id: 6, name: 'Table C-02', zone: 'Common', seats: 4, plugCap: 4, status: 'AVAILABLE' },
  ]);

  // Interactive state for score adjustments
  const [targetStudentId, setTargetStudentId] = useState('');
  const [scoreAdjustment, setScoreAdjustment] = useState('-10');
  const [adjustmentReason, setAdjustmentReason] = useState('No-show penalty without cancellation');
  const [scoreMessage, setScoreMessage] = useState('');

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    const user = getStoredUser();
    if (!user || user.role !== 'ADMIN') {
      router.replace('/login');
      return;
    }
  }, [token, router]);

  if (!token || !adminUser || adminUser.role !== 'ADMIN') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-canvas">
        <p className="text-gray-500">Verifying administrative credentials…</p>
      </div>
    );
  }

  const toggleTableMaintenance = (tableId: number) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId ? { ...t, status: t.status === 'CLOSED' ? 'AVAILABLE' : 'CLOSED' } : t
      )
    );
  };

  const handleScoreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStudentId.trim()) {
      setScoreMessage('Please specify a Student ID or Email.');
      return;
    }
    setScoreMessage(
      `Adjustment of ${scoreAdjustment} points recorded for ${targetStudentId} (${adjustmentReason}).`
    );
    setTargetStudentId('');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas px-4 py-8 sm:px-8 lg:px-16">
      {/* Top Administrative Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-xl border border-hairline bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Library Administration Portal
            </h1>
            <span className="rounded-full bg-chula-pink px-2.5 py-0.5 text-xs font-semibold text-white">
              ADMIN
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Logged in as{' '}
            <span className="font-semibold text-gray-800">
              {adminUser.firstname} {adminUser.lastname}
            </span>{' '}
            ({adminUser.email})
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/zones"
            className="rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Live Floor Plan
          </Link>
          <Link
            href="/"
            className="rounded-md border border-hairline bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
          >
            Main Site
          </Link>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-hairline bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Operating Mode
          </p>
          <p className="mt-2 text-xl font-bold text-gray-900">Normal Hours</p>
          <p className="mt-1 text-xs text-gray-600">08:00 – 21:00 (Open)</p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Tables</p>
          <p className="mt-2 text-xl font-bold text-gray-900">
            {tables.filter((t) => t.status !== 'CLOSED').length} / {tables.length} Active
          </p>
          <p className="mt-1 text-xs text-gray-600">
            {tables.filter((t) => t.status === 'CLOSED').length} under maintenance
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Facility Issues
          </p>
          <p className="mt-2 text-xl font-bold text-emerald-600">All Clear</p>
          <p className="mt-1 text-xs text-gray-600">0 pending critical tickets</p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Min Booking Score
          </p>
          <p className="mt-2 text-xl font-bold text-gray-900">50.0 Pts</p>
          <p className="mt-1 text-xs text-gray-600">Threshold for reservation lock</p>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="mb-6 flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('seats')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'seats'
              ? 'border-chula-pink text-chula-pink'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Seats & Table Operations
        </button>
        <button
          onClick={() => setActiveTab('scores')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'scores'
              ? 'border-chula-pink text-chula-pink'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Behavior Score Adjustments
        </button>
        <button
          onClick={() => setActiveTab('issues')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'issues'
              ? 'border-chula-pink text-chula-pink'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Facility Reports & Maintenance
        </button>
        <button
          onClick={() => setActiveTab('schedules')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'schedules'
              ? 'border-chula-pink text-chula-pink'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Schedules & Operating Rules
        </button>
      </div>

      {/* Tab 1: Seats & Tables Operations */}
      {activeTab === 'seats' && (
        <div className="rounded-xl border border-hairline bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Table & Seat Operations</h2>
              <p className="text-sm text-gray-600">
                Manage operational status, seat capacities, and maintenance closures across zones.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Table Identifier</th>
                  <th className="px-4 py-3">Zone Type</th>
                  <th className="px-4 py-3">Capacity</th>
                  <th className="px-4 py-3">Plug Outlets</th>
                  <th className="px-4 py-3">Current Status</th>
                  <th className="px-4 py-3 text-right">Librarian Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tables.map((table) => (
                  <tr key={table.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 font-semibold text-gray-900">{table.name}</td>
                    <td className="px-4 py-3">{table.zone} Zone</td>
                    <td className="px-4 py-3">{table.seats} seats</td>
                    <td className="px-4 py-3">{table.plugCap} sockets</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          table.status === 'AVAILABLE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : table.status === 'OCCUPIED'
                              ? 'bg-blue-100 text-blue-800'
                              : table.status === 'RESERVED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {table.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleTableMaintenance(table.id)}
                        className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                          table.status === 'CLOSED'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        {table.status === 'CLOSED' ? 'Reopen Table' : 'Close for Maintenance'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Behavior Score Adjustments */}
      {activeTab === 'scores' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Adjust Behavior Credit Score</h2>
            <p className="mt-1 text-sm text-gray-600">
              Apply administrative score penalties or restorations. Score changes are recorded in
              the audit history.
            </p>

            <form onSubmit={handleScoreSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Target Student ID / Email
                </label>
                <input
                  type="text"
                  placeholder="e.g. 6731315721 or alice@student.chula.ac.th"
                  value={targetStudentId}
                  onChange={(e) => setTargetStudentId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black focus:border-rose-400 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Score Adjustment</label>
                <select
                  value={scoreAdjustment}
                  onChange={(e) => setScoreAdjustment(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black focus:border-rose-400 focus:outline-none"
                >
                  <option value="-10">-10 pts (Standard No-Show penalty)</option>
                  <option value="-20">-20 pts (Repeated infraction / Disturbance)</option>
                  <option value="-50">-50 pts (Immediate suspension trigger)</option>
                  <option value="+10">
                    +10 pts (Administrative restoration / Appeal accepted)
                  </option>
                  <option value="+20">+20 pts (Full restoration)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Audit Reason</label>
                <input
                  type="text"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black focus:border-rose-400 focus:outline-none"
                  required
                />
              </div>

              {scoreMessage && (
                <p className="text-sm font-medium text-emerald-600">{scoreMessage}</p>
              )}

              <button
                type="submit"
                className="w-full rounded-md bg-chula-pink px-4 py-2 font-semibold text-white transition-colors hover:bg-chula-pink-hover"
              >
                Apply Score Adjustment
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-hairline bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Score Policy Guidelines</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-600">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="font-semibold text-gray-900">Default Score: 100.0 Pts</p>
                <p className="text-xs text-gray-500">
                  Every student/visitor begins with full standing.
                </p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="font-semibold text-amber-900">Warning Zone: 50.0 – 69.9 Pts</p>
                <p className="text-xs text-amber-700">Account flagged for multiple no-shows.</p>
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="font-semibold text-red-900">Suspension Cutoff: &lt; 50.0 Pts</p>
                <p className="text-xs text-red-700">
                  System automatically revokes advance reservation privileges.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Facility Reports */}
      {activeTab === 'issues' && (
        <div className="rounded-xl border border-hairline bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Facility & Maintenance Tickets</h2>
          <p className="mt-1 text-sm text-gray-600">
            Track and resolve reported equipment issues and table maintenance requests.
          </p>

          <div className="mt-4 divide-y divide-gray-100">
            <div className="py-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Table G-02: Power socket loose
                </p>
                <p className="text-xs text-gray-500">
                  Reported on 2nd Floor Group Zone • Table status set to CLOSED
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                In Progress
              </span>
            </div>
            <div className="py-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Table S-05: Monitor HDMI connection restored
                </p>
                <p className="text-xs text-gray-500">Resolved by Library IT Staff</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                Resolved
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Schedules & Rules */}
      {activeTab === 'schedules' && (
        <div className="rounded-xl border border-hairline bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Library Operating Schedules & Rules
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            System configuration parameters governing reservations, grace windows, and operating
            hours.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Max Booking Duration</p>
              <p className="mt-1 text-lg font-bold text-gray-900">180 Minutes (3 hrs)</p>
              <p className="mt-1 text-xs text-gray-500">Maximum slot length per reservation</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Max Advance Booking</p>
              <p className="mt-1 text-lg font-bold text-gray-900">7 Days</p>
              <p className="mt-1 text-xs text-gray-500">Users can reserve up to 1 week ahead</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">
                Check-in Late Threshold
              </p>
              <p className="mt-1 text-lg font-bold text-gray-900">15 Minutes</p>
              <p className="mt-1 text-xs text-gray-500">
                No-show auto worker releases table after 15m
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
