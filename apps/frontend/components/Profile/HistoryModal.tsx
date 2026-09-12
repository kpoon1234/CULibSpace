'use client';

import { useState, useEffect } from 'react';
import { API_URL, getAuthToken } from '@/lib/auth';

type HistoryRecord = {
  id: string;
  date: string;
  start: string;
  end: string;
  score: string | number;
  reason: string;
};

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  const ITEMS_PER_PAGE = 5;
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const handleSeeMore = () => {
    setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
  };

  useEffect(() => {
    // Only fetch if the modal is open
    if (!isOpen) return;

    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const token = getAuthToken();
        if (!token) {
          setError('Please log in to view behavior score history.');
          return;
        }

        const response = await fetch(`${API_URL}/api/auth/score`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to load history records');
        }

        const data = await response.json();
        if (data && Array.isArray(data.history)) {
          const formatted: HistoryRecord[] = data.history.map(
            (
              entry: {
                timestamp: string;
                scoreChange: number;
                adminName?: string;
              },
              idx: number
            ) => {
              const dt = new Date(entry.timestamp);
              const dateStr = !isNaN(dt.getTime())
                ? dt.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })
                : '—';
              const timeStr = !isNaN(dt.getTime())
                ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '—';
              const scoreStr =
                entry.scoreChange > 0 ? `+${entry.scoreChange}` : `${entry.scoreChange}`;

              return {
                id: `${entry.timestamp}-${idx}`,
                date: dateStr,
                start: timeStr,
                end: '—',
                score: scoreStr,
                reason: entry.adminName ? `Adjusted by ${entry.adminName}` : 'Score Adjustment',
              };
            }
          );
          setHistoryData(formatted);
        } else {
          setHistoryData([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen]);

  // Don't render anything if the modal is closed
  if (!isOpen) return null;

  return (
    // Modal Overlay (Backdrop with outside click)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Behavior Score History"
    >
      {/* Modal Container */}
      <div className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="relative bg-pink-400 py-4 text-center">
          <h1 className="text-lg font-semibold text-white">Behavior Score History</h1>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-white/90 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Close modal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="bg-gray-50/30 p-4 sm:p-8">
          <div className="flex flex-col rounded-md border border-gray-200 bg-white">
            {/* Table Headers */}
            <div className="grid grid-cols-12 bg-gray-200 p-3 text-sm font-semibold text-gray-700">
              <div className="col-span-2 text-center">Date</div>
              <div className="col-span-2 text-center">Time</div>
              <div className="col-span-2 text-center">End time</div>
              <div className="col-span-2 text-center">Score</div>
              <div className="col-span-4 pl-4">Reason</div>
            </div>

            {/* Table Body (Scrollable container) */}
            <div className="max-h-[40vh] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-gray-500">Loading history...</div>
              ) : error ? (
                <div className="p-8 text-center text-sm text-red-500">{error}</div>
              ) : historyData.length > 0 ? (
                historyData.slice(0, visibleCount).map((record) => {
                  const isNegative = String(record.score).startsWith('-');
                  const isPositive = String(record.score).startsWith('+');

                  return (
                    <div
                      key={record.id}
                      className="grid grid-cols-12 items-center border-t border-gray-100 p-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      <div className="col-span-2 text-center font-medium text-gray-800">
                        {record.date}
                      </div>
                      <div className="col-span-2 text-center font-medium text-gray-800">
                        {record.start}
                      </div>
                      <div className="col-span-2 text-center font-medium text-gray-800">
                        {record.end}
                      </div>
                      <div
                        className={`col-span-2 text-center font-bold ${
                          isNegative
                            ? 'text-red-500'
                            : isPositive
                              ? 'text-emerald-500'
                              : 'text-gray-400'
                        }`}
                      >
                        {record.score}
                      </div>
                      <div className="col-span-4 pl-4 text-gray-600">{record.reason}</div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-sm text-gray-400">
                  No history records found.
                </div>
              )}
            </div>
          </div>

          {/* Pagination / Load More */}
          {visibleCount < historyData.length && !isLoading && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={handleSeeMore}
                className="text-sm font-medium text-gray-400 transition-colors hover:text-chula-pink focus:outline-none"
              >
                [ see more ]
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
