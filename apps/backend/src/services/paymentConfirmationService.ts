import { PaymentStatus, PrismaClient, TicketStatus } from '@prisma/client';
import type {
  GatewayCheckoutStatus,
  GatewayPaymentEvent,
  PaymentGateway,
} from './paymentGateway.js';

const defaultPrisma = new PrismaClient();

export class PaymentConfirmationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 422
  ) {
    super(message);
  }
}

function paymentIdFrom(reference: string | undefined): number {
  if (!reference || !/^[1-9]\d*$/.test(reference)) {
    throw new PaymentConfirmationError('INVALID_PAYMENT_REFERENCE', 'Invalid payment reference.');
  }
  const id = Number(reference);
  if (!Number.isSafeInteger(id) || id > 2_147_483_647) {
    throw new PaymentConfirmationError('INVALID_PAYMENT_REFERENCE', 'Invalid payment reference.');
  }
  return id;
}

function validDate(date: Date | undefined): date is Date {
  return date instanceof Date && Number.isFinite(date.getTime());
}

type ConfirmationResult = {
  handled: boolean;
  duplicate?: boolean;
  activated?: boolean;
  paymentId?: number;
};

/** Only trusted gateway adapters/reconciliation may call this service. There is
 * intentionally no user-facing endpoint accepting { paid: true }.
 * All writers of failed/expired/refunded statuses must respect the same payment
 * row lock / conditional transitions and never downgrade a paid payment. */
export class PaymentConfirmationService {
  static async handleWebhook(
    event: GatewayPaymentEvent,
    gateway: PaymentGateway,
    prisma: PrismaClient = defaultPrisma
  ): Promise<ConfirmationResult> {
    // Handle failed payments: keep ticket inactive, update payment status to FAILED
    if (event.type === 'payment.failed') {
      return this.handleFailedPayment(event, gateway, prisma);
    }

    // Handle expired payments: keep ticket inactive, update payment status to EXPIRED
    if (event.type === 'payment.expired') {
      return this.handleExpiredPayment(event, gateway, prisma);
    }

    // Only payment.succeeded events are handled for activation.
    if (event.type !== 'payment.succeeded') return { handled: false };
    if (event.paymentState !== 'paid') {
      throw new PaymentConfirmationError('PAYMENT_NOT_PAID', 'Payment has not been paid.');
    }
    if (event.livemode === true) {
      throw new PaymentConfirmationError(
        'LIVE_PAYMENT_DISABLED',
        'Only test payments are supported.'
      );
    }
    if (
      !event.eventId ||
      event.eventId.length > 255 ||
      !event.gatewayRef ||
      event.gatewayRef.length > 255
    ) {
      throw new PaymentConfirmationError(
        'INVALID_PAYMENT_EVENT',
        'Invalid payment event identity.'
      );
    }
    const paymentId = paymentIdFrom(event.reference);
    const receipt = await prisma.paymentWebhookEvent.findUnique({
      where: { gateway_eventId: { gateway: gateway.name, eventId: event.eventId } },
    });
    if (receipt) {
      this.assertReceipt(receipt, paymentId, event.gatewayRef);
      return { handled: true, duplicate: true, activated: false, paymentId };
    }

    // Verify current payment state independently of the signed notification.
    const checkout = await gateway.retrieveCheckoutStatus(event.gatewayRef);
    if (checkout.state !== 'paid') {
      throw new PaymentConfirmationError(
        'PAYMENT_CONFIRMATION_UNAVAILABLE',
        'Gateway has not confirmed the payment.',
        503
      );
    }
    if (
      checkout.reference !== event.reference ||
      checkout.amountSatang !== event.amountSatang ||
      checkout.currency?.toUpperCase() !== event.currency?.toUpperCase()
    ) {
      throw new PaymentConfirmationError(
        'PAYMENT_EVENT_MISMATCH',
        'Payment event does not match the checkout.'
      );
    }
    return this.confirmCheckout(gateway.name, event.gatewayRef, checkout, prisma, event.eventId);
  }

  /** Shared by webhook and US6-1 recovery. Network I/O is completed BEFORE the
   * transaction. Row locks serialize independent events and recovery attempts. */
  static async confirmCheckout(
    gateway: string,
    gatewayRef: string,
    checkout: GatewayCheckoutStatus,
    prisma: PrismaClient = defaultPrisma,
    eventId?: string
  ): Promise<ConfirmationResult> {
    const paymentId = paymentIdFrom(checkout.reference);
    if (checkout.state !== 'paid' || checkout.livemode === true) {
      throw new PaymentConfirmationError(
        'PAYMENT_NOT_PAID',
        'Only confirmed test payments may activate tickets.'
      );
    }
    if (!gatewayRef || gatewayRef.length > 255) {
      throw new PaymentConfirmationError('INVALID_GATEWAY_REFERENCE', 'Invalid checkout identity.');
    }

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT paymentid FROM payment WHERE paymentid = ${paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { paymentId } });
      if (!payment) {
        throw new PaymentConfirmationError(
          'PAYMENT_NOT_FOUND',
          'Payment is not available yet.',
          503
        );
      }
      if (
        payment.gateway !== gateway ||
        (payment.gatewayRef && payment.gatewayRef !== gatewayRef)
      ) {
        throw new PaymentConfirmationError(
          'PAYMENT_REFERENCE_MISMATCH',
          'Checkout does not belong to this payment.'
        );
      }
      if (
        !Number.isInteger(checkout.amountSatang) ||
        checkout.amountSatang! <= 0 ||
        payment.amountSatang !== checkout.amountSatang ||
        payment.currency.toUpperCase() !== checkout.currency?.toUpperCase()
      ) {
        throw new PaymentConfirmationError(
          'PAYMENT_AMOUNT_MISMATCH',
          'Payment amount or currency does not match.'
        );
      }
      if (payment.status === PaymentStatus.REFUNDED) {
        throw new PaymentConfirmationError(
          'PAYMENT_REFUNDED',
          'Refunded payments cannot activate tickets.'
        );
      }
      await tx.$queryRaw`SELECT ticketid FROM ticket WHERE ticketid = ${payment.ticketId} FOR UPDATE`;
      const ticket = await tx.ticket.findUnique({ where: { ticketId: payment.ticketId } });
      if (!ticket || ticket.uid !== payment.uid) {
        throw new PaymentConfirmationError(
          'PAYMENT_OWNER_MISMATCH',
          'Payment and ticket ownership do not match.'
        );
      }

      const activate = ticket.status === TicketStatus.UNPAID;
      if (
        activate &&
        (!Number.isInteger(payment.ticketValidityHours) || payment.ticketValidityHours <= 0)
      ) {
        throw new PaymentConfirmationError(
          'INVALID_TICKET_VALIDITY',
          'Invalid snapshotted ticket validity.'
        );
      }
      // A receipt is committed only with successful confirmation. createMany
      // ON CONFLICT avoids aborting a PostgreSQL transaction on duplicate IDs.
      if (eventId) {
        const inserted = await tx.paymentWebhookEvent.createMany({
          data: { gateway, eventId, gatewayRef, paymentId },
          skipDuplicates: true,
        });
        if (inserted.count === 0) {
          const existing = await tx.paymentWebhookEvent.findUniqueOrThrow({
            where: { gateway_eventId: { gateway, eventId } },
          });
          this.assertReceipt(existing, paymentId, gatewayRef);
          return { handled: true, duplicate: true, activated: false, paymentId };
        }
      }

      // Ticket validity starts at our first verified activation, not at Stripe
      // object creation. Serialize this decision under the ticket row lock.
      // An already-active ticket keeps its original start even if paidAt is null.
      const confirmedAt = activate ? new Date() : (payment.paidAt ?? ticket.startDateTime);
      if (activate) {
        const end = new Date(confirmedAt.getTime() + payment.ticketValidityHours * 3_600_000);
        if (!validDate(end))
          throw new PaymentConfirmationError('INVALID_TICKET_VALIDITY', 'Invalid ticket validity.');
        await tx.ticket.update({
          where: { ticketId: ticket.ticketId },
          data: { status: TicketStatus.PAID, startDateTime: confirmedAt, endDateTime: end },
        });
      }
      await tx.payment.update({
        where: { paymentId },
        data: {
          status: PaymentStatus.PAID,
          gatewayRef,
          openUid: null,
          // Never move the paid time/validity on a second success event.
          paidAt: confirmedAt,
        },
      });
      return { handled: true, duplicate: false, activated: activate, paymentId };
    });
  }

  /**
   * [US6-3] Handle failed payment: check gateway checkout state before closing attempt
   * -----------------------------------------------------------------------------------
   * A single card/payment attempt failure (e.g. payment_intent.payment_failed with
   * requires_payment_method) does NOT terminate the Checkout Session. The customer
   * can still retry with another card or payment method on the same session.
   *
   * Only when the Checkout Session itself is no longer open (e.g. expired or closed)
   * can we mark the payment as FAILED/EXPIRED and release openUid.
   *
   * IMPORTANT – PaymentIntent vs Checkout Session IDs:
   * The payment_intent.payment_failed Stripe event carries a PaymentIntent ID (pi_…)
   * as data.object.id, which is what the adapter sets as event.gatewayRef. However,
   * retrieveCheckoutStatus calls checkout.sessions.retrieve and requires a Checkout
   * Session ID (cs_…). Passing pi_… returns 404 → 'not_found', which would
   * incorrectly mark the payment FAILED even though the session is still open.
   *
   * Fix: look up the payment record early, then use the stored payment.gatewayRef
   * (the Checkout Session ID) for the gateway call rather than event.gatewayRef.
   * If the stored gatewayRef is null (payment not yet bound to a session) we cannot
   * verify the session state, so we keep openUid intact (safe fallback).
   *
   * All status updates use a row lock / conditional update on PENDING/UNCONFIRMED
   * to ensure a concurrent success webhook is never overwritten with FAILED.
   */
  private static async handleFailedPayment(
    event: GatewayPaymentEvent,
    gateway: PaymentGateway,
    prisma: PrismaClient
  ): Promise<ConfirmationResult> {
    if (!event.gatewayRef || event.gatewayRef.length > 255) {
      throw new PaymentConfirmationError('INVALID_GATEWAY_REFERENCE', 'Invalid checkout identity.');
    }

    // Resolve paymentId from the signed reference first; fall back to gatewayRef lookup.
    let paymentId: number | undefined;
    try {
      if (event.reference) {
        paymentId = paymentIdFrom(event.reference);
      }
    } catch {
      // Fall back to looking up by gatewayRef
    }

    // Look up the payment record to obtain the stored Checkout Session ID.
    // We do this BEFORE the gateway call so that:
    //   (a) we can use the correct cs_… ID even when the event carries a pi_… ID, and
    //   (b) we can verify gateway ownership before acting.
    let storedGatewayRef: string | null = null;
    if (paymentId) {
      const found = await prisma.payment.findUnique({
        where: { paymentId },
        select: { paymentId: true, gatewayRef: true, gateway: true },
      });
      if (!found) {
        return { handled: false };
      }
      // Reject events from a different gateway.
      if (found.gateway !== gateway.name) {
        return { handled: false };
      }
      storedGatewayRef = found.gatewayRef;
    } else {
      // No usable reference in the event – look up by the incoming gatewayRef.
      const found = await prisma.payment.findFirst({
        where: { gatewayRef: event.gatewayRef, gateway: gateway.name },
        select: { paymentId: true, gatewayRef: true },
      });
      if (!found) {
        return { handled: false };
      }
      paymentId = found.paymentId;
      storedGatewayRef = found.gatewayRef;
    }

    // Use the stored Checkout Session ID (cs_…) for the status check.
    // If the stored ref is null (payment not yet bound to a session) we cannot
    // confirm the session state, so preserve openUid as a safe fallback.
    if (!storedGatewayRef) {
      return { handled: true, activated: false, paymentId };
    }

    // Verify current checkout status with the gateway before deciding to close/release.
    // Uses the stored Checkout Session ID, not the incoming event.gatewayRef, to handle
    // the case where event.gatewayRef is a PaymentIntent ID (pi_…) rather than cs_….
    const checkout = await gateway.retrieveCheckoutStatus(storedGatewayRef);

    // If the checkout session is paid (e.g. customer retried and paid), confirm it.
    // Use storedGatewayRef (cs_…) – not the incoming event.gatewayRef which may be pi_….
    if (checkout.state === 'paid') {
      return this.confirmCheckout(gateway.name, storedGatewayRef, checkout, prisma, event.eventId);
    }

    // If the checkout session is still open, the customer can still retry.
    // Do NOT mark as FAILED and do NOT release openUid.
    if (checkout.state === 'open') {
      return { handled: true, activated: false, paymentId };
    }

    // If checkout state is unknown, do not close or release openUid (safe fallback)
    if (checkout.state === 'unknown') {
      return { handled: true, activated: false, paymentId };
    }

    // Checkout is no longer open (expired, not_found, etc.) and cannot be retried.
    // Use row lock and conditional update to prevent overwriting PAID under concurrency.
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT paymentid FROM payment WHERE paymentid = ${paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({
        where: { paymentId },
      });

      if (!payment) {
        return { handled: false };
      }

      // If already processed (PAID, FAILED, EXPIRED, REFUNDED), do not overwrite
      if (
        payment.status !== PaymentStatus.PENDING &&
        payment.status !== PaymentStatus.UNCONFIRMED
      ) {
        return { handled: true, duplicate: true, activated: false, paymentId: payment.paymentId };
      }

      const newStatus = PaymentStatus.FAILED;

      const applied = await tx.payment.updateMany({
        where: {
          paymentId: payment.paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
        },
        data: {
          status: newStatus,
          openUid: null,
        },
      });

      if (applied.count === 0) {
        return { handled: true, duplicate: true, activated: false, paymentId: payment.paymentId };
      }

      // Ticket stays UNPAID (inactive) - do NOT activate
      return { handled: true, duplicate: false, activated: false, paymentId: payment.paymentId };
    });
  }

  /**
   * [US6-3] Handle expired payment: update status to EXPIRED, keep ticket inactive
   * -------------------------------------------------------------------------
   * A checkout.session.expired event means the session has expired and can never be paid.
   * openUid is released so the user can start a new purchase.
   *
   * All status updates use a row lock / conditional update on PENDING/UNCONFIRMED
   * to ensure a concurrent success webhook is never overwritten with EXPIRED.
   */
  private static async handleExpiredPayment(
    event: GatewayPaymentEvent,
    gateway: PaymentGateway,
    prisma: PrismaClient
  ): Promise<ConfirmationResult> {
    if (!event.gatewayRef || event.gatewayRef.length > 255) {
      throw new PaymentConfirmationError('INVALID_GATEWAY_REFERENCE', 'Invalid checkout identity.');
    }

    let paymentId: number | undefined;
    try {
      if (event.reference) {
        paymentId = paymentIdFrom(event.reference);
      }
    } catch {
      // Fall back to looking up by gatewayRef
    }

    if (!paymentId) {
      const found = await prisma.payment.findFirst({
        where: { gatewayRef: event.gatewayRef },
        select: { paymentId: true },
      });
      if (!found) {
        return { handled: false };
      }
      paymentId = found.paymentId;
    }

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT paymentid FROM payment WHERE paymentid = ${paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({
        where: { paymentId },
      });

      if (!payment) {
        return { handled: false };
      }

      // Only update if still in an open state (PENDING or UNCONFIRMED)
      if (
        payment.status !== PaymentStatus.PENDING &&
        payment.status !== PaymentStatus.UNCONFIRMED
      ) {
        return { handled: true, duplicate: true, activated: false, paymentId: payment.paymentId };
      }

      const applied = await tx.payment.updateMany({
        where: {
          paymentId: payment.paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
        },
        data: {
          status: PaymentStatus.EXPIRED,
          openUid: null,
        },
      });

      if (applied.count === 0) {
        return { handled: true, duplicate: true, activated: false, paymentId: payment.paymentId };
      }

      // Ticket stays UNPAID (inactive) - do NOT activate
      return { handled: true, duplicate: false, activated: false, paymentId: payment.paymentId };
    });
  }

  private static assertReceipt(
    receipt: { paymentId: number; gatewayRef: string },
    paymentId: number,
    gatewayRef: string
  ) {
    if (receipt.paymentId !== paymentId || receipt.gatewayRef !== gatewayRef) {
      throw new PaymentConfirmationError(
        'PAYMENT_EVENT_ID_CONFLICT',
        'Event identity was already used for another payment.'
      );
    }
  }
}
