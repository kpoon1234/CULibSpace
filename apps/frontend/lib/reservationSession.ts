import type {
  CreateBookingInput,
  CreateBookingResult,
  LockTableResult,
  ValidateBookingInput,
} from './bookings';

export type ReservationState = {
  phase: 'holding' | 'ready' | 'submitting' | 'success' | 'failed' | 'uncertain' | 'checking';
  reason?: string;
  code?: string;
};

export interface ReservationTransport {
  lock(tableId: number): Promise<LockTableResult>;
  unlock(tableId: number, token: string): Promise<void>;
  create(input: CreateBookingInput): Promise<CreateBookingResult>;
  /** Only a matching booking is proof of success. Absence is NOT proof of rollback. */
  confirm(input: ValidateBookingInput): Promise<boolean>;
}

const HOLD_MS = 5 * 60_000;
const UNCERTAIN_MESSAGE =
  'The reservation result is not yet confirmed. Check booking status before trying again. Your hold will expire automatically if the request did not complete.';
const INVALID_LOCK_CODES = new Set([
  'LOCK_EXPIRED',
  'INVALID_LOCK',
  'LOCK_TOKEN_REQUIRED',
  'TABLE_LOCKED',
  'UNAUTHORIZED_LOCK_OWNER',
]);

/** One coordinator per signed-in session/tab. Serialising mutations also stops
 * an old acquisition (including Strict Mode replay) rotating a newer token.
 * A new modal must not acquire another table while the old POST is in flight:
 * acquireLock on the backend clears that user's holds on other tables. */
export function createReservationCoordinator(api: ReservationTransport, now = Date.now) {
  let tail: Promise<unknown> = Promise.resolve();
  let uncertain: { input: CreateBookingInput; until: number } | null = null;

  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }

  async function confirmed(input: ValidateBookingInput): Promise<boolean> {
    try {
      return await api.confirm(input);
    } catch {
      return false;
    }
  }

  return {
    open(tableId: number, onChange: (state: ReservationState) => void) {
      let disposed = false;
      let token: string | null = null;
      let expiresAt = 0;
      let attempt: CreateBookingInput | null = null;
      let state: ReservationState = { phase: 'holding' };

      function emit(next: ReservationState) {
        state = next;
        if (!disposed) onChange(next);
      }

      async function release() {
        const capturedToken = token;
        token = null; // Claim release synchronously; cleanup can run more than once.
        if (capturedToken) {
          try {
            await api.unlock(tableId, capturedToken);
          } catch {
            // Best effort: the server TTL remains the fallback.
          }
        }
      }

      async function acquire() {
        if (disposed) return;
        emit({ phase: 'holding' });
        // A transport error may have hidden a committed booking. Do not rotate
        // its token or submit again while it can still be executing.
        if (uncertain) {
          if (await confirmed(uncertain.input)) uncertain = null;
          else if (now() >= uncertain.until) uncertain = null;
          else {
            emit({ phase: 'failed', reason: UNCERTAIN_MESSAGE });
            return;
          }
        }
        if (disposed) return;
        try {
          const result = await api.lock(tableId);
          if (result.ok && result.lockToken) {
            token = result.lockToken;
            const deadline = Date.parse(result.lockedUntil ?? '');
            expiresAt = Number.isFinite(deadline) ? deadline : now() + HOLD_MS;
            if (disposed) await release();
            else emit({ phase: 'ready' });
          } else {
            emit({ phase: 'failed', reason: result.reason || 'This table cannot be held.' });
          }
        } catch {
          emit({ phase: 'failed', reason: 'Unable to hold this table. Please try again.' });
        }
      }

      // Deferring to the queue lets an immediate Strict Mode cleanup cancel an
      // acquisition before it is sent. Already-sent acquisitions are released
      // before any subsequent acquisition starts.
      void run(acquire);

      const session = {
        get state() {
          return state;
        },
        get disposed() {
          return disposed;
        },
        get submitting() {
          return state.phase === 'submitting';
        },
        get succeeded() {
          return state.phase === 'success';
        },
        submit(window: Omit<ValidateBookingInput, 'tableId'>): Promise<void> {
          if (disposed || state.phase !== 'ready' || !token) return Promise.resolve();
          if (now() >= expiresAt) {
            token = null;
            emit({ phase: 'failed', reason: 'Your hold expired. Try again to hold the table.' });
            return Promise.resolve();
          }
          const input = { ...window, tableId, lockToken: token };
          attempt = input;
          emit({ phase: 'submitting' }); // Synchronous guard against double submit/close.
          return run(async () => {
            let result: CreateBookingResult;
            try {
              result = await api.create(input);
            } catch {
              result = { ok: false, uncertain: true };
            }
            if (!result.ok && result.uncertain) {
              uncertain = { input, until: expiresAt };
              if (await confirmed(input)) result = { ok: true };
            }
            if (result.ok) {
              token = null; // Consumed by the booking transaction, BEFORE notifying the UI.
              if (uncertain?.input === input) uncertain = null;
              emit({ phase: 'success' });
            } else if (result.uncertain) {
              emit({ phase: 'uncertain', reason: UNCERTAIN_MESSAGE });
              // Never release on an unknown outcome, even after unmount.
            } else {
              if (result.code && INVALID_LOCK_CODES.has(result.code)) token = null;
              emit({
                phase: 'failed',
                reason: result.reason || 'The reservation was rejected.',
                code: result.code,
              });
              if (disposed) await release();
            }
          });
        },
        retry(): Promise<void> {
          if (disposed || !['failed', 'uncertain'].includes(state.phase)) return Promise.resolve();
          if (state.phase === 'uncertain' && attempt) {
            const input = attempt;
            emit({ phase: 'checking', reason: UNCERTAIN_MESSAGE });
            return run(async () => {
              if (await confirmed(input)) {
                token = null;
                if (uncertain?.input === input) uncertain = null;
                emit({ phase: 'success' });
              } else if (now() >= expiresAt) {
                token = null;
                if (uncertain?.input === input) uncertain = null;
                emit({
                  phase: 'failed',
                  reason: 'The hold has expired. Check My Booking before reserving again.',
                });
              } else {
                emit({ phase: 'uncertain', reason: UNCERTAIN_MESSAGE });
              }
            });
          }
          if (token && now() < expiresAt) {
            emit({ phase: 'ready' });
            return Promise.resolve();
          }
          token = null;
          emit({ phase: 'holding' });
          return run(acquire);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          // Acquisition/submission owns its captured token until it settles.
          // Unknown outcomes are left to reconciliation or the server TTL.
          if (state.phase === 'ready' || state.phase === 'failed') void run(release);
        },
      };
      return session;
    },
  };
}

export type ReservationSession = ReturnType<
  ReturnType<typeof createReservationCoordinator>['open']
>;
