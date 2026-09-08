'use client';

import { useState, useEffect } from 'react';

// [BACKEND INTEGRATION POINT 1]: Define the exact shape of the data you expect from the API.
type HistoryRecord = {
  id: string;
  date: string;
  start: string;
  end: string;
  score: string | number;
  reason: string;
};

export default function HistoryPage() {
  const ITEMS_PER_PAGE = 5; // Number of records to show at a time
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const handleSeeMore = () => {
    setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
  };
  //อันนี้ actual data backend บอกกุทีทำไง
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        // Replace '/api/history' with your actual backend endpoint
        const response = await fetch('/api/history'); //ตรงนี้

        if (!response.ok) {
          throw new Error('Failed to load history records');
        }

        const data: HistoryRecord[] = await response.json();
        setHistoryData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  //อันนี้ actual data backend บอกกุทีทำไง

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
