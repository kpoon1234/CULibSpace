import { PrismaClient, PaymentStatus, TicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PaymentGateway, PaymentGatewayError, CheckoutSessionResult } from './paymentGateway.js';

const defaultPrisma = new PrismaClient();

/** รหัส gateway ที่บันทึกลงฐานข้อมูล */
export const PAYMENT_GATEWAY_NAME = 'stripe';

/** ความยาวสูงสุดของ client key ที่ API รับได้ (ตรงกับคอลัมน์ client_key) */
export const MAX_CLIENT_KEY_LENGTH = 64;

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

/** ค่าจาก SystemConfig ที่ Backend ใช้กำหนดราคาและอายุตั๋วเอง */
interface TicketPricingConfig {
  ticketPriceSatang: number;
  ticketValidityHours: number;
  paymentCheckoutExpiryMinutes: number;
}

/**
 * [US6-1] ซื้อตั๋วผู้เข้าชมภายนอก
 * -------------------------------------------------------------------------
 * ขอบเขตงานนี้จบที่: สร้าง Ticket (UNPAID) + Payment (PENDING) -> สร้าง checkout
 * กับ gateway -> ส่ง ticketId / paymentId / checkoutUrl ให้ frontend
 * (การยืนยันผลชำระเงินและการเปิดใช้ตั๋วเป็นของ US6-3)
 *
 * หลักการสำคัญ:
 *   1. Backend อ่านราคา + อายุใช้งานตั๋วจาก SystemConfig เท่านั้น
 *      ถ้าอ่าน config ไม่ได้หรือค่าไม่ถูกต้อง -> ต้องหยุด ไม่ใช่ fallback ไปเก็บราคาผิด
 *   2. ป้องกันรายการซ้ำ 3 ชั้น (ทั้งหมดบังคับด้วย unique constraint ที่ DB)
 *      - (uid, client_key)  -> retry คำขอเดิมคืนรายการเดิม
 *      - open_uid           -> ผู้ใช้มีรายการที่ยัง "เปิด" ได้แค่รายการเดียว
 *      - กู้รายการเดิมก่อนเสมอ ไม่สร้าง checkout ซ้ำ
 *   3. gateway อาจสร้าง checkout สำเร็จแต่ response ไม่ถึง (timeout)
 *      -> เก็บสถานะ UNCONFIRMED ไว้ (ไม่ตัดเป็น FAILED)
 *      -> ครั้งถัดไปที่ยิงด้วย idempotency key เดิม จะกู้ checkout เดิมกลับมาได้
 *         เพราะ gateway เก็บผลลัพธ์ของ idempotency key เดิมไว้
 *   4. ตั๋วจะยังไม่ถูกเปิดใช้งานจนกว่าจะได้รับ webhook ยืนยันการชำระเงินสำเร็จ
 */
export class TicketService {
  static async purchase(
    input: TicketPurchaseInput,
    gateway: PaymentGateway,
    prisma: any = defaultPrisma
  ): Promise<TicketPurchaseResult> {
    const now = input.now ?? new Date();
    const uid = input.uid;

    // ---------- 1. ตรวจสิทธิ์และโปรไฟล์ผู้ซื้อ ----------
    await this.assertPurchasableUser(uid, prisma);

    // ---------- 2. Backend กำหนดราคาและอายุใช้งานตั๋วเอง ----------
    // ถ้าอ่าน config ไม่ได้ -> โยน error ทันที (ห้าม fallback ไปเก็บราคาผิด)
    const config = await this.readPricingConfig(prisma);
    const amountSatang = config.ticketPriceSatang;
    const currency = 'THB';
    const validityMs = config.ticketValidityHours * 60 * 60 * 1000;
    const checkoutExpiryMs = config.paymentCheckoutExpiryMinutes * 60 * 1000;
    const expiresAt = new Date(now.getTime() + checkoutExpiryMs);

    // ---------- 3. กันรายการซ้ำ ----------
    const clientKey = input.idempotencyKey ?? `auto_${randomUUID()}`;

    // 3.1 retry คำขอเดิม (client key เดิม)
    const byClientKey = await prisma.payment.findFirst({
      where: { uid, clientKey },
    });
    if (byClientKey) {
      const outcome = await this.resolveExisting(byClientKey, gateway, prisma, now);
      if (outcome) {
        return this.handleExistingPayment(outcome, prisma, gateway, now);
      }
      // รายการเดิมหมดอายุและถูกปิดแล้ว -> ทำรายการใหม่ต่อได้
    }

    // 3.2 ผู้ใช้มีรายการที่ยัง "เปิด" อยู่ไหม (PENDING / UNCONFIRMED)
    //     ถ้ามี -> ต้องกู้รายการเดิมก่อน จึงจะเริ่มรายการใหม่ได้
    const openPayment = await this.findOpenPayment(uid, prisma);
    if (openPayment) {
      const outcome = await this.resolveExisting(openPayment, gateway, prisma, now);
      if (outcome) {
        return this.handleExistingPayment(outcome, prisma, gateway, now);
      }
      // รายการเดิมหมดอายุและถูกปิดแล้ว -> ทำรายการใหม่ต่อได้
    }

    // ---------- 4. สร้าง Ticket + Payment (transaction) ----------
    const ticketStart = now;
    const ticketEnd = new Date(now.getTime() + validityMs);
    const idempotencyKey = this.buildIdempotencyKey(uid, clientKey);

    let created: { ticket: any; payment: any };
    try {
      created = await prisma.$transaction(async (tx: any) => {
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
            clientKey,
            idempotencyKey,
            // snapshot อายุใช้งานตั๋วไว้ตอนซื้อ เพื่อไม่ให้ config ที่แก้ระหว่างรอจ่าย
            // เปลี่ยนอายุตั๋วของผู้ใช้
            ticketValidityHours: config.ticketValidityHours,
            expiresAt,
            // จองช่อง "รายการที่เปิดอยู่" ของผู้ใช้ไว้ 1 ช่อง (unique)
            // -> กันไม่ให้มีรายการเปิดพร้อมกันมากกว่า 1 รายการ
            openUid: uid,
          },
        });

        return { ticket, payment };
      });
    } catch (error: any) {
      // ชน unique constraint -> มีคำขอพร้อมกันสร้างรายการเดียวกันไปแล้ว
      // ให้ดึงรายการที่มีอยู่แล้วมาตอบแทน (idempotent)
      const raced = await this.resolveRacedPayment(uid, clientKey, prisma);
      if (raced) {
        return this.handleExistingPayment(raced, prisma, gateway, now);
      }
      throw error;
    }

    // ---------- 5. เรียก gateway ----------
    let session: CheckoutSessionResult;
    try {
      session = await gateway.createCheckoutSession({
        amountSatang,
        currency,
        // reference ที่ส่งให้ gateway ต้องเป็น paymentId เสมอ
        // (US6-3 ใช้ค่านี้ค้นหารายการ จะได้เจอแม้ยังไม่ได้บันทึก gateway_ref)
        reference: String(created.payment.paymentId),
        description: `CU LibSpace visitor ticket (${uid})`,
        expiresAt,
        idempotencyKey,
        customerEmail: (await this.getUserEmail(uid, prisma)) ?? undefined,
        successUrl: process.env.TICKET_CHECKOUT_SUCCESS_URL,
        cancelUrl: process.env.TICKET_CHECKOUT_CANCEL_URL,
      });
    } catch (error) {
      throw await this.handleGatewayFailure(created.payment.paymentId, error, prisma);
    }

    // ---------- 6. บันทึกผลจาก gateway ----------
    const updated = await prisma.payment.update({
      where: { paymentId: created.payment.paymentId },
      data: {
        gatewayRef: session.gatewayRef,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt,
        status: PaymentStatus.PENDING,
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

  // ------------------------------------------------------------------
  // ภายใน
  // ------------------------------------------------------------------

  /**
   * ตรวจสิทธิ์ผู้ซื้อ: ต้องเป็นบุคคลภายนอก มีโปรไฟล์ครบ และมีเอกสารยืนยันตัวตน
   */
  private static async assertPurchasableUser(uid: number, prisma: any): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { uid },
      select: {
        uid: true,
        isProfileComplete: true,
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
  }

  private static async getUserEmail(uid: number, prisma: any): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { uid },
      select: { email: true },
    });
    return user?.email ?? null;
  }

  /**
   * อ่านราคา/อายุตั๋วจาก SystemConfig
   * ------------------------------------------------------------------
   * ห้าม fallback เป็นค่า default เมื่ออ่านไม่ได้หรือค่าไม่ถูกต้อง
   * เพราะจะทำให้เรียกเก็บเงินผิดราคา (เช่นเก็บ 50 บาท แทนราคาจริง)
   */
  private static async readPricingConfig(prisma: any): Promise<TicketPricingConfig> {
    let config: any;
    try {
      config = await prisma.systemConfig.findFirst();
    } catch (error) {
      console.error('[TicketService] Failed to read system config:', error);
      throw {
        status: 503,
        code: 'CONFIG_UNAVAILABLE',
        message:
          'Ticket pricing is temporarily unavailable. Please try again in a moment. (No charge was made.)',
        retryable: true,
      } as TicketPurchaseError;
    }

    if (!config) {
      throw {
        status: 503,
        code: 'CONFIG_UNAVAILABLE',
        message:
          'Ticket pricing has not been configured yet. Please contact the library staff. (No charge was made.)',
        retryable: false,
      } as TicketPurchaseError;
    }

    const price = Number(config.ticketPriceSatang);
    const validityHours = Number(config.ticketValidityHours);
    const expiryMinutes = Number(config.paymentCheckoutExpiryMinutes);

    if (!Number.isInteger(price) || price <= 0) {
      throw {
        status: 503,
        code: 'INVALID_TICKET_PRICE',
        message: 'Ticket price is not configured correctly. (No charge was made.)',
        retryable: false,
      } as TicketPurchaseError;
    }

    if (!Number.isInteger(validityHours) || validityHours <= 0) {
      throw {
        status: 503,
        code: 'INVALID_TICKET_VALIDITY',
        message: 'Ticket validity is not configured correctly. (No charge was made.)',
        retryable: false,
      } as TicketPurchaseError;
    }

    if (!Number.isInteger(expiryMinutes) || expiryMinutes <= 0) {
      throw {
        status: 503,
        code: 'INVALID_CHECKOUT_EXPIRY',
        message: 'Checkout expiry is not configured correctly. (No charge was made.)',
        retryable: false,
      } as TicketPurchaseError;
    }

    return {
      ticketPriceSatang: price,
      ticketValidityHours: validityHours,
      paymentCheckoutExpiryMinutes: expiryMinutes,
    };
  }

  /**
   * key เต็มที่ส่งให้ gateway
   * ความยาวสูงสุด = MAX_CLIENT_KEY_LENGTH (64) + prefix -> ต้องไม่เกิน 128 ตัว (ขนาดคอลัมน์)
   */
  private static buildIdempotencyKey(uid: number, clientKey: string): string {
    return `user_${uid}_${clientKey}`.slice(0, 128);
  }

  /**
   * หารายการที่ยัง "เปิด" อยู่ของผู้ใช้ (PENDING = สร้าง checkout แล้วรอจ่าย,
   * UNCONFIRMED = gateway ตอบไม่ชัดเจน ต้องกู้)
   */
  private static async findOpenPayment(uid: number, prisma: any) {
    return prisma.payment.findFirst({
      where: {
        uid,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * กรณีชน unique constraint (มีคำขอพร้อมกันสร้างรายการเดียวกัน)
   * -> ดึงรายการที่มีอยู่แล้วมาตอบแทน
   */
  private static async resolveRacedPayment(
    uid: number,
    clientKey: string,
    prisma: any
  ): Promise<any | null> {
    try {
      const byKey = await prisma.payment.findFirst({ where: { uid, clientKey } });
      if (byKey) return byKey;

      return await this.findOpenPayment(uid, prisma);
    } catch {
      return null;
    }
  }

  /**
   * ตัดสินใจกับรายการที่มีอยู่แล้ว
   * ------------------------------------------------------------------
   * @returns รายการที่ควรนำไปตอบ client (replay) หรือ null เมื่อรายการนั้นหมดอายุ
   *          และปิดแล้ว (จึงเริ่มรายการใหม่ได้)
   */
  private static async resolveExisting(
    payment: any,
    gateway: PaymentGateway,
    prisma: any,
    now: Date
  ): Promise<any | null> {
    const isOpen =
      payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.UNCONFIRMED;

    if (!isOpen) {
      // รายการปิดแล้ว (Paid / Failed / Expired) -> ตอบรายการเดิมตามสถานะ
      return payment;
    }

    return await this.reconcileOpenPayment(payment, gateway, prisma, now);
  }

  /**
   * กู้รายการเดิมก่อนอนุญาตให้ซื้อใหม่
   * ------------------------------------------------------------------
   * - ถ้าหมดอายุแล้ว -> ปิดรายการ (EXPIRED) แล้วคืน null เพื่อให้ caller ไปสร้างรายการใหม่
   * - ถ้ายังไม่หมดอายุและมี checkoutUrl -> ใช้รายการเดิมต่อ
   * - ถ้ายังไม่หมดอายุและไม่มี checkoutUrl (เคย timeout) -> ยิง gateway ซ้ำด้วย
   *   idempotency key เดิม เพื่อกู้ checkout เดิม (gateway คืน session เดิม ไม่สร้างซ้ำ)
   */
  private static async reconcileOpenPayment(
    payment: any,
    gateway: PaymentGateway,
    prisma: any,
    now: Date
  ): Promise<any | null> {
    // หมดอายุแล้ว -> ปิดรายการ แล้วคืน null เพื่อให้ caller ไปสร้างรายการใหม่
    if (payment.expiresAt && new Date(payment.expiresAt).getTime() <= now.getTime()) {
      await prisma.payment.updateMany({
        where: {
          paymentId: payment.paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
        },
        data: { status: PaymentStatus.EXPIRED, openUid: null },
      });
      return null;
    }

    // มี checkoutUrl แล้ว -> ใช้รายการเดิมต่อ ไม่ต้องยิง gateway ซ้ำ
    if (payment.checkoutUrl) {
      return payment;
    }

    // ยังไม่มี checkoutUrl -> พยายามกู้ด้วย idempotency key เดิม
    try {
      const session = await gateway.createCheckoutSession({
        amountSatang: payment.amountSatang,
        currency: payment.currency,
        reference: String(payment.paymentId),
        description: `CU LibSpace visitor ticket (${payment.uid})`,
        expiresAt: payment.expiresAt,
        idempotencyKey: payment.idempotencyKey,
      });

      return await prisma.payment.update({
        where: { paymentId: payment.paymentId },
        data: {
          gatewayRef: session.gatewayRef,
          checkoutUrl: session.checkoutUrl,
          expiresAt: session.expiresAt,
          status: PaymentStatus.PENDING,
        },
      });
    } catch (error) {
      // กู้ไม่ได้ -> เก็บสถานะรอตรวจสอบไว้ ห้ามสร้างรายการใหม่
      console.error(`[TicketService] Could not reconcile payment #${payment.paymentId}:`, error);
      await prisma.payment.updateMany({
        where: {
          paymentId: payment.paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
        },
        data: { status: PaymentStatus.UNCONFIRMED },
      });
      return payment;
    }
  }

  /**
   * จัดการ error จาก gateway
   * ------------------------------------------------------------------
   * - GATEWAY_REJECTED (gateway ปฏิเสธชัดเจน) -> ปิดรายการเป็น FAILED ได้เลย
   *   เพราะ gateway ไม่ได้สร้าง checkout
   * - GATEWAY_TIMEOUT / GATEWAY_UNAVAILABLE (ผลไม่ชัดเจน) -> ห้ามตัดเป็น FAILED!
   *   เพราะอาจสร้าง checkout สำเร็จแล้ว response มาไม่ถึง
   *   -> เก็บเป็น UNCONFIRMED เพื่อรอ reconcile ในคำขอครั้งถัดไป
   */
  private static async handleGatewayFailure(
    paymentId: number,
    error: unknown,
    prisma: any
  ): Promise<TicketPurchaseError> {
    const gatewayError =
      error instanceof PaymentGatewayError
        ? error
        : new PaymentGatewayError('GATEWAY_UNAVAILABLE', 'Payment gateway is unavailable', {
            retryable: true,
            status: 503,
            cause: error,
          });

    const outcomeUnknown = gatewayError.retryable;

    try {
      await prisma.payment.updateMany({
        where: { paymentId, status: PaymentStatus.PENDING },
        data: {
          status: outcomeUnknown ? PaymentStatus.UNCONFIRMED : PaymentStatus.FAILED,
          // ถ้า gateway ปฏิเสธชัดเจน -> ไม่มี checkout ค้าง -> ปล่อยช่องให้ซื้อใหม่ได้
          openUid: outcomeUnknown ? undefined : null,
        },
      });
    } catch (updateError) {
      console.error(
        `[TicketService] Failed to update payment #${paymentId} after gateway error:`,
        updateError
      );
    }

    console.error(`[TicketService] Payment #${paymentId} gateway call failed:`, error);

    return {
      status: gatewayError.status,
      code: gatewayError.code,
      message: gatewayError.message,
      retryable: gatewayError.retryable,
    } as TicketPurchaseError;
  }

  /**
   * จัดการกรณีพบรายการเดิมอยู่แล้ว (idempotent replay)
   */
  private static async handleExistingPayment(
    payment: any,
    prisma: any,
    gateway: PaymentGateway,
    now: Date
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
      expiresAt: new Date(payment.expiresAt).toISOString(),
      ticketStartDateTime: ticket ? new Date(ticket.startDateTime).toISOString() : '',
      ticketEndDateTime: ticket ? new Date(ticket.endDateTime).toISOString() : '',
      replayed: true,
    };

    if (payment.status === PaymentStatus.PENDING && payment.checkoutUrl) {
      return { ...base, checkoutUrl: payment.checkoutUrl };
    }

    if (payment.status === PaymentStatus.PAID) {
      return { ...base, checkoutUrl: payment.checkoutUrl };
    }

    if (
      payment.status === PaymentStatus.UNCONFIRMED ||
      (payment.status === PaymentStatus.PENDING && !payment.checkoutUrl)
    ) {
      // ยังไม่รู้ว่า gateway สร้าง checkout หรือไม่ -> ห้ามสร้างรายการใหม่
      // ให้ client retry ด้วย key เดิม เพื่อให้ระบบ reconcile ให้
      throw {
        status: 409,
        code: 'PAYMENT_AWAITING_CONFIRMATION',
        message:
          'A previous purchase is still awaiting payment confirmation. Please retry with the same idempotency key.',
        retryable: true,
        paymentId: payment.paymentId,
        ticketId: payment.ticketId,
      } as TicketPurchaseError;
    }

    // FAILED / EXPIRED -> คำขอเดิมถือว่าจบแล้ว client ต้องใช้ key ใหม่เพื่อซื้อใหม่
    const { status: _previousStatus, ...previousPayment } = base;
    throw {
      status: 409,
      code: 'PAYMENT_NOT_COMPLETED',
      message: `The previous payment attempt for this request is ${String(
        payment.status
      ).toLowerCase()}. Use a new idempotency key to start a new purchase.`,
      retryable: true,
      ...previousPayment,
    } as TicketPurchaseError;
  }
}

export default TicketService;
