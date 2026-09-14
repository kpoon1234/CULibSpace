'use client';

import { useState, useEffect } from 'react';
import { API_URL, getAuthToken } from '@/lib/auth';

type HistoryRecord = {
  id: string;
  date: string;
  start: string;
  end: string;
  tableDetails: string;
  status: string;
  statusClassName: string;
  timestamp: number; // Used for sorting
};

interface HistoryBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HistoryBookingModal({ isOpen, onClose }: HistoryBookingModalProps) {
  const ITEMS_PER_PAGE = 5;
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const handleSeeMore = () => {
    setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
  };

  useEffect(() => {
    // Guard: only fetch when modal is actually open
    if (!isOpen) return;

    // Mounted guard: prevents state updates after component unmounts
    // (avoids React "Can't perform a state update on an unmounted component" race)
    let isMounted = true;

    const fetchHistory = async () => {
      if (!isMounted) return;
      setIsLoading(true);
      setError(null);

      try {
        const token = getAuthToken();

        if (!token) {
          if (isMounted) setError('Please log in to view booking history.');
          return;
        }

        const res = await fetch(`${API_URL}/api/bookings/my-history`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Failed to load reservation records');
        }

        const json = await res.json();
        const dataList = json?.data ?? json;

        if (!isMounted) return; // Component may have unmounted while fetch was in-flight

        if (Array.isArray(dataList)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formatted: HistoryRecord[] = dataList.map((booking: any) => {
            const startDt = new Date(booking.startDateTime);
            const endDt = new Date(booking.endDateTime);

            const dateStr = !isNaN(startDt.getTime())
              ? startDt.toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
              : '—';

            const startStr = !isNaN(startDt.getTime())
              ? startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—';

            const endStr = !isNaN(endDt.getTime())
              ? endDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—';

            const tableId = booking.table?.tableId || booking.tableId || 'Unknown Table';
            const seatCount = booking.table?.numberOfSeat;
            const seatInfo = seatCount
              ? ` · Seat #${tableId} (${seatCount} seats)`
              : ` · Seat #${tableId}`;
            const rawZone = booking.table?.zone?.zoneType || booking.table?.zone?.type;
            const zone =
              rawZone === 'SILENT'
                ? 'Silent Zone'
                : rawZone === 'GROUP'
                  ? 'Group Study'
                  : rawZone === 'COMMON'
                    ? 'Common Area'
                    : rawZone || 'Library';

            const normalizedStatus = String(booking.status || '')
              .trim()
              .toUpperCase()
              .replace(/[\s_-]/g, '');

            let statusLabel = 'Past';
            let statusClassName = 'bg-gray-100 text-gray-600 border border-gray-200';

            if (normalizedStatus === 'ACTIVE') {
              statusLabel = 'Active';
              statusClassName = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
            } else if (normalizedStatus === 'PENDING') {
              statusLabel = 'Pending';
              statusClassName = 'bg-amber-100 text-amber-800 border border-amber-200';
            } else if (normalizedStatus === 'COMPLETED') {
              statusLabel = 'Completed';
              statusClassName = 'bg-blue-100 text-blue-700 border border-blue-200';
            } else if (normalizedStatus === 'CANCELLED' || normalizedStatus === 'CANCELED') {
              statusLabel = 'Cancelled';
              statusClassName = 'bg-gray-100 text-gray-700 border border-gray-300';
            } else if (normalizedStatus === 'NOSHOW' || normalizedStatus.includes('SHOW')) {
              statusLabel = 'No-show';
              statusClassName = 'bg-red-100 text-red-700 border border-red-200';
            }

            return {
              id: String(
                booking.bookingId || booking.id || `${booking.startDateTime}-${Math.random()}`
              ),
              date: dateStr,
              start: startStr,
              end: endStr,
              tableDetails: `Table #${tableId}${seatInfo} · ${zone}`,
              status: statusLabel,
              statusClassName,
              timestamp: startDt.getTime(),
            };
          });

          // Sort by startDateTime descending (latest on top)
          formatted.sort((a, b) => b.timestamp - a.timestamp);
          if (isMounted) setHistoryData(formatted);
        } else {
          if (isMounted) setHistoryData([]);
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();

    // Cleanup: mark as unmounted so in-flight fetch doesn't update stale state
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Booking History"
    >
      <div className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="relative bg-chula-pink py-4 text-center">
          <h1 className="text-lg font-semibold text-white">Booking History</h1>
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
              <div className="col-span-2 text-center">Start time</div>
              <div className="col-span-2 text-center">End time</div>
              <div className="col-span-4 pl-4">Table & Zone</div>
              <div className="col-span-2 text-center">Status</div>
            </div>

            {/* Table Body (Scrollable container) */}
            <div className="max-h-[40vh] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-gray-500">Loading history...</div>
              ) : error ? (
                <div className="p-8 text-center text-sm text-red-500">{error}</div>
              ) : historyData.length > 0 ? (
                historyData.slice(0, visibleCount).map((record) => (
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
                    <div className="col-span-4 pl-4 text-gray-600">{record.tableDetails}</div>
                    <div className="col-span-2 flex justify-center">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${record.statusClassName}`}
                      >
                        {record.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-gray-400">
                  No Booking history found.
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
