'use client';

import { useState, useEffect } from 'react';

// [BACKEND INTEGRATION POINT 1]: Define the exact shape of the data you expect from the API.
type HistoryRecord = {
  id: string;
  date: string;
  start: string;
  end: string;
  score: string | number; // e.g., "-5", "+10", or "0"
  reason: string;
};

export default function HistoryPage() {
  const ITEMS_PER_PAGE = 5; // Number of records to show at a time
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const handleSeeMore = () => {
    setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
  };
  // [BACKEND INTEGRATION POINT 2]: Replace this state with your actual data fetching hook (e.g., SWR, React Query, or a fetch call inside useEffect).
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([
    //อันนี้ actual data backend บอกกุทีทำไง
    {
      id: '1',
      date: '2026-09-04',
      start: '11:30',
      end: '13:30',
      score: '-10',
      reason: 'No-show for reserved table at Main Library',
    },
    {
      id: '2',
      date: '2026-08-28',
      start: '11:30',
      end: '13:30',
      score: '+5',
      reason: 'Perfect attendance for the week',
    },
    {
      id: '3',
      date: '2026-08-15',
      start: '11:30',
      end: '13:30',
      score: '0',
      reason: 'Cancelled reservation within allowed time',
    },
    {
      id: '4',
      date: '2026-08-01',
      start: '11:30',
      end: '13:30',
      score: '-5',
      reason: 'Late arrival (exceeded 15 minutes)',
    },
    {
      id: '5',
      date: '2026-07-20',
      start: '11:30',
      end: '13:30',
      score: '+10',
      reason: 'Completed library etiquette survey',
    },
    {
      id: '6',
      date: '2026-07-10',
      start: '11:30',
      end: '13:30',
      score: '0',
      reason: 'Standard reservation completed',
    },
    {
      id: '7',
      date: '2026-07-10',
      start: '11:30',
      end: '13:30',
      score: '0',
      reason: 'Standard reservation completed',
    },
    {
      id: '8',
      date: '2026-07-10',
      start: '11:30',
      end: '13:30',
      score: '0',
      reason: 'Standard reservation completed',
    },
    {
      id: '9',
      date: '2026-07-10',
      start: '11:30',
      end: '13:30',
      score: '0',
      reason: 'Standard reservation completed',
    },
    {
      id: '10',
      date: '2026-07-10',
      start: '11:30',
      end: '13:30',
      score: '0',
      reason: 'Standard reservation completed',
    },
    {
      id: '11',
      date: '2026-07-10',
      start: '11:30',
      end: '13:30',
      score: '0',
      reason: 'Standard reservation completed',
    },
    //อันนี้ actual data backend บอกกุทีทำไง
  ]);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col justify-between bg-pink-100 p-4 sm:p-8">
      {/* Main Content Area */}
      <main className="mx-auto my-auto w-full max-w-5xl py-8">
        <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_5px_15px_0_hsla(220,30%,5%,0.05),0_15px_35px_-5px_hsla(220,25%,10%,0.05)]">
          {/* Header Bar */}
          <div className="bg-rose-400 py-4 text-center">
            <h1 className="text-lg font-semibold text-white">Behavior Score History</h1>
          </div>

          <div className="p-4 sm:p-8 bg-gray-50/30">
            <div className="flex flex-col rounded-md border border-gray-200 bg-white">
              {/* Table Headers */}
              <div className="grid grid-cols-12 bg-gray-200 p-3 text-sm font-semibold text-gray-700">
                <div className="col-span-2 text-center">Date</div>
                <div className="col-span-2 text-center">Start time</div>
                <div className="col-span-2 text-center">End time</div>
                <div className="col-span-1 text-center">Score</div>
                <div className="col-span-3 pl-4">Reason</div>
              </div>

              {/* Table Body (Scrollable container) */}
              <div className="max-h-[400px] overflow-y-auto">
                {/* [BACKEND INTEGRATION POINT 3]: Map over your fetched state variable here */}
                {historyData.length > 0 ? (
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
            {/* [BACKEND INTEGRATION POINT 4]: Hook this up to a pagination query or fetchNextPage function */}
            {visibleCount < historyData.length && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={handleSeeMore}
                  className="text-sm font-medium text-gray-400 transition-colors hover:text-rose-600 focus:outline-none"
                >
                  [ see more ]
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ========================================== */}
      {/* FOOTER PLACEHOLDER                         */}
      {/* ========================================== */}
      {/* <footer className="w-full border-t border-rose-200/50 py-4 text-center text-xs text-gray-500">
             Footer Component Goes Here
          </footer> */}
    </div>
  );
}
