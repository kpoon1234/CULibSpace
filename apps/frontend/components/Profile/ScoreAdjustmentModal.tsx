'use client';

import { useState } from 'react';
import { API_URL, getAuthToken } from '@/lib/auth';
import { USER_TYPE_LABEL } from '@/components/AdminUsers/format';

interface TargetUser {
  uid: number;
  firstname: string;
  lastname: string;
  userType: string;
  behaviourScore: number;
}

interface ScoreAdjustmentModalProps {
  onClose: () => void;
  targetUser: TargetUser | null;
  onSuccess: () => void;
}

type Action = 'add' | 'deduct';

export default function ScoreAdjustmentModal({
  onClose,
  targetUser,
  onSuccess,
}: ScoreAdjustmentModalProps) {
  const [action, setAction] = useState<Action>('deduct');
  const [score, setScore] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitted(true);

    if (!targetUser) {
      setError('No user selected.');
      return;
    }

    if (!score.trim()) {
      setError('Score amount is required.');
      return;
    }

    const scoreValue = Number(score);
    if (!Number.isInteger(scoreValue) || scoreValue <= 0) {
      setError('Please enter a valid whole number greater than 0.');
      return;
    }

    if (!reason.trim()) {
      setError('Reason is required.');
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

      let data: { error?: string; message?: string } | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Your admin session has expired. Please sign in again.');
        } else {
          setError(data?.error || 'Failed to adjust score.');
        }
        return;
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while adjusting the score.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!targetUser) return null;

  const scoreEmpty = !score.trim();
  const reasonEmpty = !reason.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (isSubmitting) return;
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
            onClick={isSubmitting ? undefined : onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className={`absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-all ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'text-white/90 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'}`}
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
              {USER_TYPE_LABEL[targetUser.userType as keyof typeof USER_TYPE_LABEL]} &bull; Current
              behaviour score: {targetUser.behaviourScore} / 100
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
                step="1"
                value={score}
                onChange={(event) => {
                  setScore(event.target.value);
                  setSubmitted(false);
                }}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:border-rose-400 focus:outline-none ${
                  submitted && scoreEmpty ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0"
              />
              {submitted && scoreEmpty && (
                <p className="mt-1 text-xs text-red-600">This field is required.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Reason</label>
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setSubmitted(false);
                }}
                rows={3}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:border-rose-400 focus:outline-none ${
                  submitted && reasonEmpty ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter reason for score adjustment"
              />
              {submitted && reasonEmpty && (
                <p className="mt-1 text-xs text-red-600">This field is required.</p>
              )}
            </div>

            {error && (
              <div className="mt-2 rounded-md bg-red-50 p-3 border border-red-100">
                <p className="flex items-start gap-2 text-sm text-red-700">
                  <span className="shrink-0">⚠</span>
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-chula-pink px-4 py-2 font-semibold text-white transition-colors hover:bg-chula-pink-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-chula-pink"
            >
              {isSubmitting ? 'Adjusting…' : 'Confirm Adjustment'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
