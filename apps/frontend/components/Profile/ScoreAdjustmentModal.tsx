'use client';

import { useState } from 'react';
import { API_URL, getAuthToken } from '@/lib/auth';

interface TargetUser {
  uid: number;
  firstname: string;
  lastname: string;
  behaviourScore: number;
}

interface ScoreAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: TargetUser | null;
}

type Action = 'add' | 'deduct';

export default function ScoreAdjustmentModal({
  isOpen,
  onClose,
  targetUser,
}: ScoreAdjustmentModalProps) {
  const [action, setAction] = useState<Action>('deduct');
  const [score, setScore] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (!targetUser) {
      setError('No user selected.');
      return;
    }

    const scoreValue = Number(score);
    if (!scoreValue || scoreValue <= 0) {
      setError('Please enter a valid score greater than 0.');
      return;
    }

    if (!reason.trim()) {
      setError('Please enter a reason for the adjustment.');
      return;
    }

    const scoreChange = action === 'add' ? scoreValue : -scoreValue;

    const token = getAuthToken();
    if (!token) {
      setError('Please log in to adjust the score.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/adjust-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUid: targetUser.uid,
          scoreChange,
          reason: reason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to adjust score.');
      }

      setSuccess(true);
      setScore('');
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while adjusting the score.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen || !targetUser) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Score Adjustment"
    >
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="relative bg-chula-pink py-4 text-center">
          <h1 className="text-lg font-semibold text-white">Adjust User Score</h1>
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
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">
              {targetUser.firstname} {targetUser.lastname}
            </h2>
            <p className="text-sm text-gray-600">
              Current behaviour score: {targetUser.behaviourScore} / 100
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700">Adjustment type</label>
              <div className="mt-1 flex items-center gap-1 rounded-md border border-gray-300 bg-white p-1">
                <button
                  type="button"
                  role="radio"
                  aria-checked={action === 'add'}
                  onClick={() => setAction('add')}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${action === 'add' ? 'bg-chula-pink text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  Add score
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={action === 'deduct'}
                  onClick={() => setAction('deduct')}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${action === 'deduct' ? 'bg-chula-pink text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  Deduct score
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Score amount</label>
              <input
                type="number"
                min="1"
                required
                value={score}
                onChange={(event) => setScore(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black focus:border-rose-400 focus:outline-none"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Reason</label>
              <textarea
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-black focus:border-rose-400 focus:outline-none"
                placeholder="Enter reason for score adjustment"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-chula-pink px-4 py-2 font-semibold text-white transition-colors hover:bg-chula-pink-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-chula-pink"
            >
              {isSubmitting ? 'Adjusting…' : 'Confirm Adjustment'}
            </button>
          </form>

          {success && (
            <p className="mt-3 text-center text-sm font-medium text-emerald-600">
              Score adjusted successfully.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
