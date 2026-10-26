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

/**
 * [US6-3] Payment Confirmation Service
 * -------------------------------------------------------------------------
 * ยืนยันผลการชำระเงินจาก webhook ของ Payment Gateway และเปิดใช้ตั๋ว
 *
 * หลักการ:
 *   1. ไม่มี endpoint ให้ผู้ใช้ส่ง { paid: true } มาเอง — ยืนยันได้เฉพาะจาก gateway
 *   2. ทุกการเปลี่ยนสถานะต้อง respect conditional transitions (ห้าม downgrade Paid)
 *   3. ใบเสร็จ (receipt) ถูกสร้างเฉพาะเมื่อยืนยันสำเร็จเท่านั้น
 *   4. Network I/O (retrieveCheckoutStatus) ต้องเสร็จก่อน transaction
 *   5. Row locks (FOR UPDATE) ป้องกัน race condition ระหว่าง webhook ซ้ำ/พร้อมกัน
 */
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

    // Idempotency: check if this event was already processed
    const receipt = await prisma.paymentWebhookEvent.findUnique({
      where: { gateway_eventId: { gateway: gateway.name, eventId: event.eventId } },
    });
    if (receipt) {
      this.assertReceipt(receipt, paymentId, event.gatewayRef);
      return { handled: true, duplicate: true, activated: false, paymentId };
    }

    // Verify current payment state independently of the signed notification
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

  /**
   * [US6-3] Handle failed payment: update status to FAILED, keep ticket inactive
   * -------------------------------------------------------------------------
   * Payment remains inactive (ticket stays UNPAID) and user can retry with a new purchase.
   * openUid is released so the user can start a new purchase.
   */
  private static async handleFailedPayment(
    event: GatewayPaymentEvent,
    gateway: PaymentGateway,
    prisma: PrismaClient
  ): Promise<ConfirmationResult> {
    if (!event.gatewayRef || event.gatewayRef.length > 255) {
      throw new PaymentConfirmationError('INVALID_GATEWAY_REFERENCE', 'Invalid checkout identity.');
    }

    const paymentId = paymentIdFrom(event.reference);

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [{ paymentId }, { gatewayRef: event.gatewayRef }],
      },
    });

    if (!payment) {
      return { handled: false };
    }

    // Only update if still in an open state (PENDING or UNCONFIRMED)
    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.UNCONFIRMED) {
      // Already processed (PAID, FAILED, EXPIRED, REFUNDED) - no-op
      return { handled: true, duplicate: true, activated: false, paymentId: payment.paymentId };
    }

    // Update payment to FAILED and release openUid
    await prisma.payment.update({
      where: { paymentId: payment.paymentId },
      data: {
        status: PaymentStatus.FAILED,
        openUid: null,
      },
    });

    // Ticket stays UNPAID (inactive) - do NOT activate
    return { handled: true, duplicate: false, activated: false, paymentId: payment.paymentId };
  }

  /**
   * [US6-3] Handle expired payment: update status to EXPIRED, keep ticket inactive
   * -------------------------------------------------------------------------
   * Payment remains inactive (ticket stays UNPAID) and user can retry with a new purchase.
   * openUid is released so the user can start a new purchase.
   */
  private static async handleExpiredPayment(
    event: GatewayPaymentEvent,
    gateway: PaymentGateway,
    prisma: PrismaClient
  ): Promise<ConfirmationResult> {
    if (!event.gatewayRef || event.gatewayRef.length > 255) {
      throw new PaymentConfirmationError('INVALID_GATEWAY_REFERENCE', 'Invalid checkout identity.');
    }

    const paymentId = paymentIdFrom(event.reference);

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [{ paymentId }, { gatewayRef: event.gatewayRef }],
      },
    });

    if (!payment) {
      return { handled: false };
    }

    // Only update if still in an open state (PENDING or UNCONFIRMED)
    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.UNCONFIRMED) {
      // Already processed - no-op
      return { handled: true, duplicate: true, activated: false, paymentId: payment.paymentId };
    }

    // Update payment to EXPIRED and release openUid
    await prisma.payment.update({
      where: { paymentId: payment.paymentId },
      data: {
        status: PaymentStatus.EXPIRED,
        openUid: null,
      },
    });

    // Ticket stays UNPAID (inactive) - do NOT activate
    return { handled: true, duplicate: false, activated: false, paymentId: payment.paymentId };
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
      // Row lock: serialize concurrent events for the same payment
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

      // Row lock: serialize access to the ticket
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

      // Receipt: committed only with successful confirmation.
      // createMany with skipDuplicates avoids aborting a PostgreSQL transaction on duplicate IDs.
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

      // Ticket validity starts at our first verified activation, not at Stripe object creation.
      // Serialize this decision under the ticket row lock.
      // An already-active ticket keeps its original start even if paidAt is null.
      const confirmedAt = activate ? new Date() : (payment.paidAt ?? ticket.startDateTime);

      if (activate) {
        const end = new Date(confirmedAt.getTime() + payment.ticketValidityHours * 3_600_000);
        if (!validDate(end)) {
          throw new PaymentConfirmationError('INVALID_TICKET_VALIDITY', 'Invalid ticket validity.');
        }
        await tx.ticket.update({
          where: { ticketId: ticket.ticketId },
          data: {
            status: TicketStatus.PAID,
            startDateTime: confirmedAt,
            endDateTime: end,
          },
        });
      }

      // Update payment status -> PAID, clear openUid, set paidAt
      await tx.payment.update({
        where: { paymentId },
        data: {
          status: PaymentStatus.PAID,
          gatewayRef,
          openUid: null,
          // Never move the paid time/validity on a second success event.
          paidAt: payment.paidAt ?? confirmedAt,
        },
      });

      return { handled: true, duplicate: false, activated: activate, paymentId };
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

export default PaymentConfirmationService;
