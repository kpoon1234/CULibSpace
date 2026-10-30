# Reservation hold regression tests

Run `npm test --workspace=apps/frontend` from the repository root (Node 22+).
These tests use deferred promises and mocked HTTP, not a database or Playwright.
They run in the PR workflow before the frontend build.

- `reservationSession.test.ts`: acquisition/cleanup ordering, Strict Mode replay,
  token expiry, duplicate submit, navigation during booking, definitive rejection,
  and reconciliation of unknown outcomes.
- `bookings.test.ts`: backend error codes, timeout/5xx classification, exact-match
  confirmation, and credentials captured before requests enter the queue.
- `ticketHistory.test.ts` (US6-2): visitor ticket phase (active, upcoming, awaiting
  payment, unpaid, expired, refunded), which ticket is shown as current, validity
  window and amount formatting, and the `fetchMyTickets` HTTP client contract.
- `authSession.test.ts`: `verifyStoredSession`, which `/login` uses before redirecting
  a stored session away: expired or malformed tokens are invalid without a request,
  401/403/404 are invalid, and an offline or 5xx backend leaves the session alone.

## Manual browser checks

Use disposable test data or mock HTTP responses; do not experiment on live bookings.

1. Open a table and cancel while editing. Its hold should be released. Selecting
   another table must still work. Cancel during a delayed acquisition should close
   immediately; the eventual token should be released before the next acquisition.
2. Delay `POST /api/bookings`. After Confirm, Cancel, date/time inputs and the submit
   button are disabled; clicking the backdrop must not close the modal or unlock.
   Repeated submit must not send a second POST.
3. Force a route change/unmount before resolving the POST. There must be no unlock
   while it is pending. Resolve success: no unlock afterwards either. Resolve a
   definitive business-rule rejection: release that attempt's token exactly once.
   Opening another modal must wait for the old operation, and the old response
   must not close or mark the new modal successful.
4. Return `LOCK_EXPIRED`/`INVALID_LOCK`. Try again must acquire a fresh token;
   a non-null old token must not bypass acquisition. Also test local TTL expiry.
5. Lose the POST response or return a timeout/502. The UI must say the result is
   unconfirmed. Check booking status sends only a GET; no automatic unlock or new
   booking POST. A matching pending/active booking confirms success. An empty,
   different or failed read remains inconclusive; the server hold TTL is the fallback.
6. Repeat opening/closing under React Strict Mode in development. Old acquisitions
   and cleanup must never rotate/release a later attempt's token.

The coordinator is scoped to one authenticated browser tab. It survives modal and
client-side route unmounts, not a full page reload/tab shutdown. It is not a server
idempotency mechanism or a cross-tab lock. The existing backend token/owner checks
and transaction remain authoritative. `my-active` is only positive confirmation:
it may return a different reservation, so absence is never treated as proof that
the POST rolled back.

## Admin score modal: stale-response manual regression

Use mocked adjustment responses (or disposable test data), with the real
`AdminUsersPage` and `ScoreAdjustmentModal`. Allow switching the selected target
in the test harness while an older request is deliberately held pending.

1. Submit for A, switch to B and submit for B. Resolve A first: B must remain open
   and submitting, without an A success notice or refresh. Resolve B: only now
   should the modal close, display B's success notice and refresh the list.
2. Submit for A, switch to B, then reopen A and submit a new request. Resolve the
   old A request first: the new A modal and its pending submission must remain
   untouched. Resolve the new A request: it should close and refresh normally.
3. The parent compares the current modal target by identity, not UID alone. Each
   opening creates a fresh target object, so A -> B -> A cannot accept A's old
   callback just because the UID matches again.

These browser checks are manual, not part of the automated `npm test` suite.
