import { PrismaClient, PaymentStatus, TicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PaymentGateway, PaymentGatewayError, CheckoutSessionResult } from './paymentGateway.js';

const defaultPrisma = new PrismaClient();

/** รหัส gateway ที่บันทึกลงฐานข้อมูล */
export const PAYMENT_GATEWAY_NAME = 'stripe';

/** ค่า default เมื่อ SystemConfig อ่านไม่ได้ */
const DEFAULT_TICKET_PRICE_SATANG = 5000; // 50.00 THB
const DEFAULT_TICKET_VALIDITY_HOURS = 2;
const DEFAULT_CHECKOUT_EXPIRY_MINUTES = 30;

/**
 * ช่วงเวลาที่ถือว่า "เพิ่งกดซื้อ" และให้ถือว่าเป็นการกดซ้ำ (double click)
 * ใช้เฉพาะกรณี client ไม่ได้ส่ง idempotency key มา
 */
const DUPLICATE_PURCHASE_WINDOW_MS = 2 * 60 * 1000;

export interface TicketPurchaseError {
  status: number;
  code: string;
  message: string;
  [key: string]: unknown;
}

export interface TicketPurchaseResult {
  ticketId: number;
  paymentId: number;
  checkoutUrl: string | null;
  amountSatang: number;
  currency: string;
  status: PaymentStatus;
  ticketStatus: TicketStatus;
  /** เวลาหมดอายุของคำสั่งซื้อ (payment attempt) */
  expiresAt: string;
  /** ช่วงเวลาใช้งานตั๋ว (ยังเป็นค่าเดิมจนกว่าจะจ่ายเงินสำเร็จ) */
  ticketStartDateTime: string;
  ticketEndDateTime: string;
  /** true = คืนรายการเดิม (idempotent replay) ไม่ได้สร้างใหม่ */
  replayed: boolean;
}

export interface TicketPurchaseInput {
  uid: number;
  /** key กันซ้ำจาก client (ไม่บังคับ แต่แนะนำให้ส่ง) */
  idempotencyKey?: string;
  now?: Date;
}

export class TicketService {
  /**
   * [US6-1] ซื้อตั๋วผู้เข้าชมภายนอก
   * -------------------------------------------------------------------------
   * สรุป flow:
   *   1. Backend อ่านราคา + อายุใช้งานตั๋วจาก SystemConfig เท่านั้น (client ส่งมาไม่ได้)
   *   2. กันรายการซ้ำด้วย idempotency key (retry คำขอเดิม) และหน้วย double-click
   *   3. สร้าง Ticket (UNPAID) + Payment (PENDING) ใน transaction เดียวกัน
   *   4. เรียก gateway เพื่อสร้าง checkout session -> ได้ checkoutUrl
   *   5. คืน ticketId / paymentId / checkoutUrl ให้ frontend ไป redirect
   *
   * หมายเหตุ: ตั๋วจะยังไม่ถูกเปิดใช้งานจนกว่าจะได้รับ webhook ยืนยันการชำระเงินสำเร็จ
   */
  static async purchase(
    input: TicketPurchaseInput,
    gateway: PaymentGateway,
    prisma: any = defaultPrisma
  ): Promise<TicketPurchaseResult> {
    const now = input.now ?? new Date();
    const uid = input.uid;

    // ---------- 1. ตรวจสิทธิ์และโปรไฟล์ผู้ซื้อ ----------
    const user = await prisma.user.findUnique({
      where: { uid },
      select: {
        uid: true,
        email: true,
        firstname: true,
        lastname: true,
        isProfileComplete: true,
        userType: true,
        outsideUser: {
          select: {
            uid: true,
            thaiUser: { select: { uid: true } },
            foreignUser: { select: { uid: true } },
          },
        },
      },
    });

    if (!user) {
      throw {
        status: 404,
        code: 'USER_NOT_FOUND',
        message: `User with ID ${uid} not found`,
      } as TicketPurchaseError;
    }

    if (!user.isProfileComplete) {
      throw {
        status: 403,
        code: 'PROFILE_INCOMPLETE',
        message: 'Please complete your profile onboarding before purchasing a ticket',
      } as TicketPurchaseError;
    }

    if (!user.outsideUser) {
      throw {
        status: 403,
        code: 'NOT_AN_OUTSIDE_USER',
        message: 'Only outside visitors can purchase visitor tickets',
      } as TicketPurchaseError;
    }

    if (!user.outsideUser.thaiUser && !user.outsideUser.foreignUser) {
      throw {
        status: 403,
        code: 'OUTSIDE_PROFILE_INCOMPLETE',
        message:
          'Please complete your visitor identity (citizen ID or passport) before purchasing a ticket',
      } as TicketPurchaseError;
    }

    // ---------- 2. Backend กำหนดราคาและอายุใช้งานตั๋วเอง ----------
    const config = await this.readConfig(prisma);
    const amountSatang = config.ticketPriceSatang;
    const currency = 'THB';
    const validityMs = config.ticketValidityHours * 60 * 60 * 1000;
    const checkoutExpiryMs = config.paymentCheckoutExpiryMinutes * 60 * 1000;
    const expiresAt = new Date(now.getTime() + checkoutExpiryMs);

    // ---------- 3. กันรายการซ้ำ ----------
    const scopedKey = input.idempotencyKey ? `user_${uid}_${input.idempotencyKey}` : undefined;

    const existing = scopedKey
      ? await prisma.payment.findUnique({ where: { idempotencyKey: scopedKey } })
      : await this.findRecentPendingPayment(uid, now, prisma);

    if (existing) {
      return this.handleExistingPayment(existing, prisma, config);
    }

    // ---------- 4. สร้าง Ticket + Payment (transaction) ----------
    const ticketStart = now;
    const ticketEnd = new Date(now.getTime() + validityMs);
    const idempotencyKey = scopedKey ?? `user_${uid}_${randomUUID()}`;

    const created = await prisma.$transaction(async (tx: any) => {
      const ticket = await tx.ticket.create({
        data: {
          uid,
          status: TicketStatus.UNPAID,
          startDateTime: ticketStart,
          endDateTime: ticketEnd,
        },
      });

      const payment = await tx.payment.create({
        data: {
          ticketId: ticket.ticketId,
          uid,
          amountSatang,
          currency,
          status: PaymentStatus.PENDING,
          gateway: gateway.name,
          idempotencyKey,
          expiresAt,
        },
      });

      return { ticket, payment };
    });

    // ---------- 5. เรียก gateway ----------
    let session: CheckoutSessionResult;
    try {
      session = await gateway.createCheckoutSession({
        amountSatang,
        currency,
        reference: String(created.payment.paymentId),
        description: `CU LibSpace visitor ticket (${uid})`,
        expiresAt,
        idempotencyKey,
        customerEmail: user.email,
        successUrl: process.env.TICKET_CHECKOUT_SUCCESS_URL,
        cancelUrl: process.env.TICKET_CHECKOUT_CANCEL_URL,
      });
    } catch (error) {
      // gateway ล้มเหลว -> ทำเครื่องหมายรายการว่า FAILED และ "ไม่" เปิดใช้ตั๋ว
      await this.markPaymentFailed(created.payment.paymentId, error, prisma);
      throw this.toGatewayResponseError(error);
    }

    // ---------- 6. บันทึกผลจาก gateway ----------
    const updated = await prisma.payment.update({
      where: { paymentId: created.payment.paymentId },
      data: {
        gatewayRef: session.gatewayRef,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt,
      },
    });

    return {
      ticketId: created.ticket.ticketId,
      paymentId: updated.paymentId,
      checkoutUrl: updated.checkoutUrl,
      amountSatang: updated.amountSatang,
      currency: updated.currency,
      status: updated.status,
      ticketStatus: created.ticket.status,
      expiresAt: updated.expiresAt.toISOString(),
      ticketStartDateTime: created.ticket.startDateTime.toISOString(),
      ticketEndDateTime: created.ticket.endDateTime.toISOString(),
      replayed: false,
    };
  }

  /**
   * [US6-1] ยืนยันการชำระเงินจาก webhook ของ gateway
   * -------------------------------------------------------------------------
   * เป็นจุดเดียวที่ตั๋วถูก "เปิดใช้งาน" (Ticket.status = PAID)
   * และเลื่อนช่วงเวลาใช้งานตั๋วให้เริ่มนับจากเวลาที่จ่ายเงินจริง
   */
  static async confirmPayment(
    gatewayRef: string,
    reference: string | undefined,
    paidAt: Date | undefined,
    outcome: 'succeeded' | 'failed' | 'expired',
    prisma: any = defaultPrisma
  ): Promise<{ applied: boolean; paymentId: number | null; ticketId: number | null }> {
    const payment = await prisma.payment.findFirst({
      where: reference ? { OR: [{ idempotencyKey: reference }, { gatewayRef }] } : { gatewayRef },
    });

    if (!payment) {
      return { applied: false, paymentId: null, ticketId: null };
    }

    // เคยจัดการไปแล้ว -> ไม่ต้องทำซ้ำ (Stripe ส่ง webhook ซ้ำได้)
    if (payment.status !== PaymentStatus.PENDING) {
      return { applied: false, paymentId: payment.paymentId, ticketId: payment.ticketId };
    }

    if (outcome === 'succeeded') {
      const config = await this.readConfig(prisma);
      const validityMs = config.ticketValidityHours * 60 * 60 * 1000;
      const start = paidAt ?? new Date();
      const end = new Date(start.getTime() + validityMs);

      await prisma.$transaction(async (tx: any) => {
        const claimed = await tx.payment.updateMany({
          where: { paymentId: payment.paymentId, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.PAID, paidAt: start },
        });
        if (claimed.count === 0) return;

        await tx.ticket.update({
          where: { ticketId: payment.ticketId },
          data: {
            status: TicketStatus.PAID,
            startDateTime: start,
            endDateTime: end,
            paymentDetail: gatewayRef,
          },
        });
      });
    } else {
      const failedStatus = outcome === 'expired' ? PaymentStatus.EXPIRED : PaymentStatus.FAILED;

      await prisma.payment.updateMany({
        where: { paymentId: payment.paymentId, status: PaymentStatus.PENDING },
        data: { status: failedStatus },
      });
      // Ticket คงสถานะ UNPAID -> ใช้งานไม่ได้จนกว่าจะจ่ายเงินใหม่
    }

    return { applied: true, paymentId: payment.paymentId, ticketId: payment.ticketId };
  }

  /**
   * [US6-1] ดูรายการตั๋วของผู้ใช้ (ใช้ในหน้า "ตั๋วของฉัน")
   */
  static async myTickets(uid: number, prisma: any = defaultPrisma) {
    const tickets = await prisma.ticket.findMany({
      where: { uid },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            paymentId: true,
            amountSatang: true,
            currency: true,
            status: true,
            gateway: true,
            checkoutUrl: true,
            paidAt: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });

    return tickets.map((ticket: any) => ({
      ticketId: ticket.ticketId,
      status: ticket.status,
      startDateTime: ticket.startDateTime.toISOString(),
      endDateTime: ticket.endDateTime.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
      payments: (ticket.payments ?? []).map((payment: any) => ({
        paymentId: payment.paymentId,
        amountSatang: payment.amountSatang,
        currency: payment.currency,
        status: payment.status,
        gateway: payment.gateway,
        checkoutUrl: payment.checkoutUrl,
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
        expiresAt: payment.expiresAt.toISOString(),
        createdAt: payment.createdAt.toISOString(),
      })),
    }));
  }

  // ------------------------------------------------------------------
  // ภายใน
  // ------------------------------------------------------------------

  private static async readConfig(prisma: any) {
    let config: any = null;
    try {
      config = await prisma.systemConfig.findFirst();
    } catch {
      // ใช้ค่า default ถ้าอ่าน config ไม่ได้
    }

    const ticketPriceSatang = Number(config?.ticketPriceSatang ?? DEFAULT_TICKET_PRICE_SATANG);
    const ticketValidityHours = Number(
      config?.ticketValidityHours ?? DEFAULT_TICKET_VALIDITY_HOURS
    );
    const paymentCheckoutExpiryMinutes = Number(
      config?.paymentCheckoutExpiryMinutes ?? DEFAULT_CHECKOUT_EXPIRY_MINUTES
    );

    return {
      ticketPriceSatang:
        Number.isInteger(ticketPriceSatang) && ticketPriceSatang > 0
          ? ticketPriceSatang
          : DEFAULT_TICKET_PRICE_SATANG,
      ticketValidityHours:
        Number.isInteger(ticketValidityHours) && ticketValidityHours > 0
          ? ticketValidityHours
          : DEFAULT_TICKET_VALIDITY_HOURS,
      paymentCheckoutExpiryMinutes:
        Number.isInteger(paymentCheckoutExpiryMinutes) && paymentCheckoutExpiryMinutes > 0
          ? paymentCheckoutExpiryMinutes
          : DEFAULT_CHECKOUT_EXPIRY_MINUTES,
    };
  }

  /**
   * หา payment ที่ค้างอยู่ (PENDING) และยังไม่หมดอายุ ที่สร้างเมื่อชั่งโมงที่ผ่านมา
   * ใช้กันกรณี client ไม่ได้ส่ง idempotency key แล้วกดซื้อซ้ำ (double click)
   */
  private static async findRecentPendingPayment(uid: number, now: Date, prisma: any) {
    const since = new Date(now.getTime() - DUPLICATE_PURCHASE_WINDOW_MS);
    return prisma.payment.findFirst({
      where: {
        uid,
        status: PaymentStatus.PENDING,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private static async markPaymentFailed(
    paymentId: number,
    error: unknown,
    prisma: any
  ): Promise<void> {
    try {
      await prisma.payment.updateMany({
        where: { paymentId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
    } catch (updateError) {
      console.error(`[TicketService] Failed to mark payment #${paymentId} as FAILED:`, updateError);
    }
    if (error) {
      console.error(`[TicketService] Payment #${paymentId} gateway call failed:`, error);
    }
  }

  /**
   * จัดการกรณีที่พบรายการเดิมอยู่แล้ว (idempotent replay)
   */
  private static async handleExistingPayment(
    payment: any,
    prisma: any,
    config: { ticketValidityHours: number }
  ): Promise<TicketPurchaseResult> {
    const ticket = await prisma.ticket.findUnique({
      where: { ticketId: payment.ticketId },
    });

    const base = {
      ticketId: payment.ticketId,
      paymentId: payment.paymentId,
      amountSatang: payment.amountSatang,
      currency: payment.currency,
      status: payment.status,
      ticketStatus: ticket?.status ?? TicketStatus.UNPAID,
      expiresAt: payment.expiresAt.toISOString(),
      ticketStartDateTime: ticket?.startDateTime.toISOString() ?? '',
      ticketEndDateTime: ticket?.endDateTime.toISOString() ?? '',
      replayed: true,
    };

    if (payment.status === PaymentStatus.PENDING) {
      if (!payment.checkoutUrl) {
        // gateway ยังกำลังทำงาน (หรือค้าง) -> ให้ client retry
        throw {
          status: 409,
          code: 'PAYMENT_IN_PROGRESS',
          message:
            'A purchase for this request is still being processed. Please retry in a moment.',
          retryable: true,
        } as TicketPurchaseError;
      }

      return { ...base, checkoutUrl: payment.checkoutUrl };
    }

    if (payment.status === PaymentStatus.PAID) {
      return { ...base, checkoutUrl: payment.checkoutUrl };
    }

    // FAILED / EXPIRED -> คำขอเดิมถือว่าจบแล้ว client ต้องใช้ key ใหม่เพื่อซื้อใหม่
    const { status: _previousStatus, ...previousPayment } = base;
    throw {
      status: 409,
      code: 'PAYMENT_NOT_COMPLETED',
      message: `The previous payment attempt for this request is ${payment.status.toLowerCase()}. Use a new idempotency key to start a new purchase.`,
      retryable: true,
      ...previousPayment,
    } as TicketPurchaseError;
  }

  private static toGatewayResponseError(error: unknown): TicketPurchaseError {
    if (error instanceof PaymentGatewayError) {
      return {
        status: error.status,
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      } as TicketPurchaseError;
    }

    return {
      status: 502,
      code: 'GATEWAY_UNAVAILABLE',
      message: 'Payment gateway is temporarily unavailable. Please try again.',
      retryable: true,
    } as TicketPurchaseError;
  }
}

// helper แยกไว้เพื่อให้อ่านง่าย (ใช้ prisma ที่ถูก inject เข้ามา)
export default TicketService;
