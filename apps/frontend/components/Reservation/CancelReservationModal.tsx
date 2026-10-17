'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  cancellationClient,
  type CancellableBooking,
  type CancellationClient,
  type CancelResult,
} from '@/lib/cancellation';

type Failure = Extract<CancelResult, { ok: false }>;
type Step = 'confirm' | 'submitting' | 'success' | 'failure' | 'refreshing';

interface Props {
  booking: CancellableBooking;
  onClose: () => void;
  onCancelled: (bookingId: number) => void;
  onRefresh: () => void;
  // Used only by the optional preview; production defaults to real HTTP requests.
  client?: CancellationClient;
}

function formatWindow(booking: CancellableBooking): string {
  const start = new Date(booking.startDateTime);
  const end = new Date(booking.endDateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Time unavailable';
  const date = start.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  return `${date} · ${start.toLocaleTimeString('en-GB', options)}–${end.toLocaleTimeString('en-GB', options)}`;
}

const button =
  'min-h-11 rounded-full px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60';

export default function CancelReservationModal({
  booking,
  onClose,
  onCancelled,
  onRefresh,
  client = cancellationClient,
}: Props) {
  const [step, setStep] = useState<Step>('confirm');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const initialFocus = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const alive = useRef(false);
  const notified = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const busy = step === 'submitting' || step === 'refreshing';

  useEffect(() => {
    alive.current = true;
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    initialFocus.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      alive.current = false;
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function markCancelled() {
    setStep('success');
    if (!notified.current) {
      notified.current = true;
      onCancelled(booking.bookingId);
    }
  }

  async function submit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setStep('submitting');
    setNotice('');
    try {
      const result = await client.cancel(booking.bookingId);
      if (!alive.current) return;
      if (result.ok) markCancelled();
      else {
        setFailure(result);
        setStep('failure');
      }
    } catch {
      if (!alive.current) return;
      setFailure({
        ok: false,
        kind: 'unknown',
        message:
          'We couldn’t confirm whether your reservation was cancelled. Please refresh to check its status.',
      });
      setStep('failure');
    } finally {
      busyRef.current = false;
    }
  }

  async function refreshStatus() {
    if (busyRef.current) return;
    busyRef.current = true;
    setStep('refreshing');
    try {
      const result = await client.getStatus(booking.bookingId);
      if (!alive.current) return;
      if (!result.ok) {
        setFailure({ ok: false, kind: 'unknown', message: result.message });
        setStep('failure');
      } else if (result.status === 'CANCELLED') markCancelled();
      else if (result.status === 'PENDING') {
        setNotice('Your reservation is still pending. You can confirm cancellation again.');
        setStep('confirm');
      } else {
        setFailure({
          ok: false,
          kind: 'terminal',
          message:
            result.status === 'ACTIVE'
              ? 'You’ve already checked in. This reservation can no longer be cancelled.'
              : 'This reservation is no longer pending and cannot be cancelled.',
        });
        setStep('failure');
      }
    } catch {
      if (alive.current) {
        setFailure({
          ok: false,
          kind: 'unknown',
          message: 'Unable to check the latest reservation status. Please try again.',
        });
        setStep('failure');
      }
    } finally {
      busyRef.current = false;
    }
  }

  function close() {
    if (busyRef.current) return;
    onClose();
    onRefresh();
  }

  const zone = { SILENT: 'Silent Zone', GROUP: 'Group Study', COMMON: 'Common Area' }[
    booking.table.zone.zoneType
  ];
  const resultScreen = step === 'success' || step === 'failure' || step === 'refreshing';
  const title =
    step === 'success'
      ? 'Reservation cancelled'
      : step === 'refreshing'
        ? 'Checking reservation status'
        : resultScreen
          ? 'Unable to cancel reservation'
          : 'Cancel this reservation?';
  const description =
    step === 'success'
      ? 'Your reservation has been cancelled. Your behaviour score has not been affected.'
      : resultScreen
        ? failure?.message || 'Checking the latest reservation status…'
        : 'Your table will become available to others. Cancelling before the deadline will not affect your behaviour score.';

  // Native dialog supplies focus containment, Escape handling and background inertness.
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-3xl border-0 bg-white p-6 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:p-8 ${resultScreen ? 'max-w-md' : 'max-w-lg'}`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
    >
      {!resultScreen && (
        <div className="flex justify-end">
          <button
            type="button"
            aria-label="Close cancellation dialog"
            disabled={busy}
            onClick={close}
            className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary disabled:opacity-50"
          >
            ×
          </button>
        </div>
      )}
      <div className={resultScreen ? 'flex flex-col items-center py-4 text-center' : ''}>
        {resultScreen && (
          <span
            aria-hidden="true"
            className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md ${step === 'success' ? 'from-emerald-400 to-emerald-600' : step === 'refreshing' ? 'from-gray-400 to-gray-600' : 'from-red-500 to-red-700'}`}
          >
            {step === 'refreshing' ? (
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/40 border-t-white motion-reduce:animate-none" />
            ) : (
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={step === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}
                />
              </svg>
            )}
          </span>
        )}
        <h2
          id={titleId}
          className={`${resultScreen ? 'mt-4 ' : ''}text-2xl font-semibold text-gray-900`}
        >
          {title}
        </h2>
        {!resultScreen && (
          <div className="my-5 space-y-2 rounded-xl bg-gray-100 p-4 text-sm text-gray-800">
            <p className="font-medium">
              Table #{booking.tableId} · {zone}
            </p>
            <p>{formatWindow(booking)}</p>
          </div>
        )}
        {resultScreen && (
          <p className="mt-2 text-sm text-gray-500">
            Table #{booking.tableId} · {zone}
            <br />
            {formatWindow(booking)}
          </p>
        )}
        <p
          id={descriptionId}
          role={step === 'failure' ? 'alert' : 'status'}
          className={
            resultScreen ? 'mt-2 text-sm text-gray-500' : 'text-sm leading-relaxed text-gray-600'
          }
        >
          {description}
        </p>
        {notice && (
          <p role="status" className="mt-3 text-sm text-gray-700">
            {notice}
          </p>
        )}
        <div
          className={
            resultScreen
              ? 'mt-8 flex w-full flex-col gap-3'
              : 'mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end'
          }
        >
          {!resultScreen ? (
            <>
              <button
                ref={initialFocus}
                type="button"
                onClick={close}
                disabled={busy}
                className={`${button} border border-gray-300 bg-paper text-gray-800 hover:bg-gray-100`}
              >
                Keep reservation
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className={`${button} bg-cta-primary text-white hover:bg-cta-primary-hover`}
              >
                {busy ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </>
          ) : (
            <>
              {failure?.kind === 'retryable' && step !== 'success' && (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className="w-full rounded-full bg-rose-400 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                >
                  Try again
                </button>
              )}
              {failure?.kind === 'unknown' && step !== 'success' && (
                <button
                  type="button"
                  onClick={() => void refreshStatus()}
                  disabled={busy}
                  className="w-full rounded-full bg-rose-400 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? 'Refreshing…' : 'Refresh status'}
                </button>
              )}
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className={`w-full rounded-full px-6 py-3 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${step === 'success' ? 'bg-emerald-400 text-white hover:bg-emerald-500 focus:ring-emerald-400' : failure?.kind === 'retryable' || failure?.kind === 'unknown' ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-rose-400' : 'bg-rose-400 text-white hover:bg-rose-500 focus:ring-rose-400'}`}
              >
                Back to home
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
