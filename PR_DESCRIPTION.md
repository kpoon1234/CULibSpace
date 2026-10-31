# PR #65 – feature/us6-3-payment-confirmation-activation

## Scope (US6-3)

Activate and harden the payment confirmation flow for CULibSpace checkout.

This PR closes the two remaining edge-cases that the previous review round
identified (inline comments on fdb828a):

1. **`payment_intent.payment_failed` uses wrong ID for gateway lookup.**  
   The Stripe adapter sets `event.gatewayRef = data.object.id` which is the
   PaymentIntent ID (`pi_…`). `retrieveCheckoutStatus` internally calls
   `checkout.sessions.retrieve` which requires a Checkout Session ID (`cs_…`).
   Passing `pi_…` causes Stripe to return 404 → adapter maps to `not_found` →
   service incorrectly marks the payment `FAILED` and clears `openUid`, even
   though the Checkout Session is still `open` and the customer can retry.

2. **`checkout.session.async_payment_failed` leaves payment stuck as `PENDING`.**  
   When a delayed-payment method (bank transfer etc.) fails asynchronously,
   Stripe fires this event. The session status is `complete` with
   `payment_status = unpaid` – a definitively closed session. The Stripe adapter
   previously mapped `complete + unpaid` to `state = 'unknown'`, so
   `handleFailedPayment` returned early without releasing `openUid`. The user was
   then blocked from starting a new purchase because `openUid` was never cleared.

---

## Summary of Changes

### `apps/backend/src/services/stripePaymentGateway.ts`
| Before | After |
|--------|-------|
| `complete + unpaid` → `state: 'unknown'` | `complete + unpaid` → `state: 'expired'` |

A Checkout Session that is `complete` but `payment_status = unpaid` is a
**terminal state** – the session is closed, money never moved, no retries
possible. Returning `'expired'` (rather than `'unknown'`) allows the service to
release `openUid` under the existing row-lock / conditional-update protection.

### `apps/backend/src/services/paymentConfirmationService.ts`
- **`handleFailedPayment`** now looks up the payment record **before** calling
  `retrieveCheckoutStatus` so it can obtain the **stored** Checkout Session ID
  (`payment.gatewayRef`, always `cs_…`) instead of the incoming
  `event.gatewayRef` (which may be `pi_…` for `payment_intent.payment_failed`).
- Gateway ownership is verified before acting (`payment.gateway === gateway.name`).
- If `payment.gatewayRef` is `null` (payment not yet bound to a session) the
  handler returns without releasing `openUid` (safe fallback).
- When `checkout.state === 'paid'` after looking up by `pi_…`, `confirmCheckout`
  is called with the **stored** `cs_…` reference, not the incoming PI ID.
- Extended code comments document the PaymentIntent-vs-Session ID distinction.

### `apps/backend/src/test/test_payment_confirmation.ts`
- Updated `retrieve` mock to throw a Stripe-style 404 (`resource_missing`) when
  called with any ID starting with `pi_`, faithfully mirroring real Stripe
  behaviour and making the new regression tests meaningful.
- Updated `findFirst` mock to respect the `gateway` filter added to the lookup.
- **5 new regression tests** (total: 39 payment-confirmation tests):
  1. `payment_intent.payment_failed` with `pi_…` and open session → payment
     stays `PENDING`, `openUid` retained, ticket stays `UNPAID`.
  2. `payment_intent.payment_failed` with `pi_…` and expired session → payment
     becomes `FAILED`, `openUid` cleared.
  3. `checkout.session.async_payment_failed` (`complete + unpaid`) → payment
     becomes `FAILED`, `openUid` cleared.
  4. After `async_payment_failed`, user can start a new purchase successfully.
  5. `async_payment_failed` does **not** overwrite a concurrently `PAID` payment
     (row-lock / conditional-update race protection).

---

## Related Issues

| Issue | Description |
|-------|-------------|
| #112  | Duplicate `payment_webhook_event` migration (fixed in fdb828a). |
| #118  | Race: `failed`/`expired` webhook overwrites `PAID` (fixed in fdb828a). |
| #124  | `payment_intent.payment_failed` clears `openUid` while session is still open. |
| #127  | `checkout.session.async_payment_failed` leaves payment `PENDING` forever. |

---

## Testing & Results

| Category | Cases | Result |
|----------|------:|--------|
| Ticket purchase unit tests | 46 | ✅ all pass |
| Payment confirmation unit tests (incl. 5 new) | 39 | ✅ all pass |
| Other backend unit tests | varies | ✅ all pass |
| TypeScript build (`tsc`) | — | ✅ clean |
| PostgreSQL race regression (8-round interleave, from fdb828a) | 8 | ✅ all pass |
| CI (GitHub Actions) | — | ✅ green |

### How to reproduce the two bugs (before this fix)

**Bug 1 – `payment_intent.payment_failed` releases slot too early:**
```
1. POST /api/tickets/purchase  → payment PENDING, openUid=uid, gatewayRef=cs_xxx
2. Customer enters card → card declined (single attempt failure)
3. Stripe fires payment_intent.payment_failed { data.object.id: "pi_xxx" }
4. Webhook handler calls retrieveCheckoutStatus("pi_xxx")
   → Stripe 404 → state='not_found'
   → payment set to FAILED, openUid=null         ← BUG: slot released prematurely
5. Customer clicks "try again" → creates a second Checkout Session
   → risk of double charge if first session is retried by Stripe
```

**Bug 2 – `checkout.session.async_payment_failed` blocks next purchase:**
```
1. POST /api/tickets/purchase  → payment PENDING, openUid=uid, gatewayRef=cs_yyy
2. Customer selects bank transfer (delayed payment)
3. Bank declines the transfer asynchronously
4. Stripe fires checkout.session.async_payment_failed { data.object: { status:'complete', payment_status:'unpaid' } }
5. Webhook handler calls retrieveCheckoutStatus("cs_yyy")
   → Stripe returns { status:'complete', payment_status:'unpaid' }
   → adapter maps to state='unknown' (pre-fix)
   → handler returns early; payment stays PENDING, openUid retained ← BUG
6. Customer tries to buy again → blocked by openUid → 409 PAYMENT_AWAITING_CONFIRMATION
```
