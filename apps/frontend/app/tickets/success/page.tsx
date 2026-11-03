'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthToken, getStoredUser } from '@/lib/auth';
import {
  isValidIdempotencyKey,
  reconcileVisitorTicket,
  type TicketPurchaseData,
} from '@/lib/tickets';

const PURCHASE_KEY_PREFIX = 'culibspace:ticket-purchase:';
const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 60_000;

type PageStatus =
  | 'checking'
  | 'paid-active'
  | 'paid-not-yet'
  | 'paid-expired'
  | 'pending'
  | 'failed'
  | 'refunded'
  | 'unavailable'
  | 'timeout';

export default function TicketPaymentReturnPage() {
  const router = useRouter();
  const [status, setStatus] = useState<PageStatus>('checking');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const checkEpochRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let startTime: number | null = null;
    let checkEpoch = 0;

    async function checkPayment() {
      const epoch = ++checkEpoch;
      checkEpochRef.current = epoch;

      const token = getAuthToken();
      if (!token) {
        if (!cancelled) setStatus('failed');
        return;
      }

      const user = getStoredUser();
      if (!user?.uid || user.role !== 'OUTSIDER') {
        if (!cancelled) setStatus('failed');
        return;
      }

      const storageKey = `${PURCHASE_KEY_PREFIX}${user.uid}`;
      let storedKey: string | null = null;
      try {
        storedKey = sessionStorage.getItem(storageKey);
      } catch {
        /* sessionStorage unavailable */
      }

      if (!storedKey || !isValidIdempotencyKey(storedKey)) {
        if (!cancelled) setStatus('failed');
        return;
      }

      try {
        const result = await reconcileVisitorTicket(storedKey);

        // Discard stale responses from older polling rounds.
        if (cancelled || epoch !== checkEpochRef.current) return;

        if (!result.ok) {
          if (result.code === 'PAYMENT_NOT_FOUND') {
            if (!cancelled) setStatus('failed');
            return;
          }
          if (result.code === 'PAYMENT_AWAITING_CONFIRMATION') {
            if (!cancelled) setStatus('pending');
            return;
          }
          if (!cancelled) setStatus('failed');
          return;
        }

        const data: TicketPurchaseData = result.data;

        const { paymentStatus, ticketStatus } = data;

        const startMs = Date.parse(data.ticketStartDateTime);
        const endMs = Date.parse(data.ticketEndDateTime);
        const now = Date.now();
        const hasValidDates = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
        const isExpired = hasValidDates && now >= endMs;
        const isNotYet = hasValidDates && now < startMs;

        const isFinal =
          paymentStatus === 'FAILED' ||
          paymentStatus === 'EXPIRED' ||
          paymentStatus === 'REFUNDED' ||
          (paymentStatus === 'PAID' &&
            ticketStatus === 'PAID' &&
            hasValidDates &&
            !isExpired &&
            !isNotYet);

        if (paymentStatus === 'PAID') {
          if (ticketStatus === 'PAID') {
            if (isExpired) {
              if (!cancelled) setStatus('paid-expired');
            } else if (isNotYet) {
              if (!cancelled) setStatus('paid-not-yet');
            } else if (!hasValidDates) {
              if (!cancelled) setStatus('unavailable');
            } else {
              if (!cancelled) setStatus('paid-active');
            }
          } else {
            if (!cancelled) setStatus('pending');
          }
        } else if (paymentStatus === 'FAILED') {
          if (!cancelled) setStatus('failed');
        } else if (paymentStatus === 'EXPIRED') {
          if (!cancelled) setStatus('failed');
        } else if (paymentStatus === 'REFUNDED') {
          if (!cancelled) setStatus('refunded');
        } else {
          if (!cancelled) setStatus('pending');
        }

        if (isFinal && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      } catch {
        if (!cancelled) setStatus('failed');
      }
    }

    checkPayment();
    startTime = Date.now();
    startTimeRef.current = startTime;

    pollTimer = setInterval(() => {
      // Stop polling if max wait exceeded.
      if (startTime && Date.now() - startTime >= MAX_WAIT_MS) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        if (!cancelled) setStatus('timeout');
        return;
      }

      // Stop polling if already at a final status.
      if (
        status === 'paid-active' ||
        status === 'paid-not-yet' ||
        status === 'paid-expired' ||
        status === 'failed' ||
        status === 'refunded' ||
        status === 'unavailable' ||
        status === 'timeout'
      ) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        return;
      }

      checkPayment();
    }, POLL_INTERVAL_MS);

    pollTimerRef.current = pollTimer;

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  useEffect(() => {
    // After a successful confirmation, go to My Tickets so the visitor sees
    // their active ticket directly. Other statuses stay on this page.
    if (status === 'paid-active') {
      const timer = setTimeout(() => {
        router.replace('/visitor/tickets');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [router, status]);

  const renderMessage = () => {
    switch (status) {
      case 'checking':
      case 'pending':
        return (
          <>
            <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">กำลังรอยืนยันการชำระเงิน</h1>
            <p className="mt-4 leading-7 text-gray-600">
              ยังไม่ได้รับการยืนยันการชำระเงินจากระบบ กรุณารอสักครู่ขณะเราตรวจสอบสถานะอัตโนมัติ
            </p>
          </>
        );
      case 'paid-active':
        return (
          <>
            <p className="text-sm font-semibold text-rose-600">PAYMENT CONFIRMED</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Your payment was successful</h1>
            <p className="mt-4 leading-7 text-gray-600">
              ชำระสำเร็จ — ตั๋วของคุณใช้งานได้แล้ว กำลังพาไปยังตั๋วของฉัน…
            </p>
          </>
        );
      case 'paid-not-yet':
        return (
          <>
            <p className="text-sm font-semibold text-rose-600">PAYMENT CONFIRMED</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">
              ชำระสำเร็จ — ยังไม่ถึงเวลาใช้งาน
            </h1>
            <p className="mt-4 leading-7 text-gray-600">
              การชำระเงินสำเร็จแล้ว แต่ตั๋วยังไม่ถึงช่วงเวลาที่ใช้งานได้
            </p>
          </>
        );
      case 'paid-expired':
        return (
          <>
            <p className="text-sm font-semibold text-rose-600">PAYMENT CONFIRMED</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">ชำระสำเร็จ — ตั๋วหมดอายุ</h1>
            <p className="mt-4 leading-7 text-gray-600">
              การชำระเงินสำเร็จ แต่ช่วงเวลาใช้งานตั๋วหมดอายุแล้ว
            </p>
          </>
        );
      case 'timeout':
        return (
          <>
            <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">ยังรอยืนยันการชำระเงิน</h1>
            <p className="mt-4 leading-7 text-gray-600">
              ระบบยังไม่สามารถยืนยันสถานะการชำระเงินได้ภายในเวลาที่กำหนด
              กรุณาลองตรวจสอบอีกครั้งหรือดูตั๋วของคุณ
            </p>
          </>
        );
      case 'failed':
        return (
          <>
            <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">ชำระเงินไม่สำเร็จ</h1>
            <p className="mt-4 leading-7 text-gray-600">
              ไม่สามารถยืนยันการชำระเงินได้ในขณะนี้ กรุณาไปยังหน้าตั๋วเพื่อตรวจสอบหรือลองใหม่
            </p>
          </>
        );
      case 'refunded':
        return (
          <>
            <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">คืนเงินแล้ว</h1>
            <p className="mt-4 leading-7 text-gray-600">
              รายการชำระเงินนี้ถูกคืนเงินแล้ว กรุณาไปยังหน้าตั๋วเพื่อเริ่มรายการใหม่
            </p>
          </>
        );
      case 'unavailable':
        return (
          <>
            <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">ไม่สามารถตรวจยืนยันสถานะได้</h1>
            <p className="mt-4 leading-7 text-gray-600">
              ข้อมูลเวลาใช้งานไม่ถูกต้องหรือไม่ครบถ้วน กรุณาไปยังหน้าตั๋วเพื่อตรวจสอบอีกครั้ง
            </p>
          </>
        );
    }
  };

  const renderActions = () => {
    const common = (
      <Link
        href="/"
        className="inline-flex rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        Return to home
      </Link>
    );

    switch (status) {
      case 'paid-active':
        return (
          <>
            <Link
              href="/visitor/tickets"
              className="inline-flex rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover"
            >
              View my tickets
            </Link>
            {common}
          </>
        );
      case 'timeout':
      case 'pending':
      case 'failed':
      case 'refunded':
      case 'unavailable':
        return (
          <>
            <Link
              href="/visitor/ticket"
              className="inline-flex rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover"
            >
              ดูตั๋วของฉัน
            </Link>
            {common}
          </>
        );
      default:
        return common;
    }
  };

  return (
    <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
      {renderMessage()}
      <div className="mt-7 flex flex-wrap justify-center gap-3">{renderActions()}</div>
    </section>
  );
}
