import { PrismaClient, PaymentStatus, TicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  PaymentGateway,
  PaymentGatewayError,
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
} from './paymentGateway.js';

const defaultPrisma = new PrismaClient();
const prisma = new PrismaClient();
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
 * payload สำหรับสร้าง checkout ที่ "เตรียมไว้แล้ว"
 * เก็บลงฐานข้อมูลเพื่อให้ retry ใช้พารามิเตอร์ชุดเดิมเป๊ะ ๆ
 * (gateway ปฏิเสธการใช้ idempotency key เดิมถ้าพารามิเตอร์ต่างกัน)
 */
interface StoredCheckoutPayload {
  amountSatang: number;
  currency: string;
  reference: string;
  description: string;
  expiresAt: string;
  idempotencyKey: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
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
    const config = await this.readPricingConfig(prisma, gateway);
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

    // เตรียม payload ของ checkout ไว้ก่อน แล้วเก็บลงรายการ
    // เพื่อให้ทุกครั้งที่ retry ใช้พารามิเตอร์ชุดเดิมเป๊ะ ๆ
    // (expires_at ถูกคำนวณจากเวลา "ตอนสร้างรายการ" ไม่ใช่เวลา ณ ตอน retry)
    const prepared = gateway.prepareCheckoutSession({
      amountSatang,
      currency,
      description: `CU LibSpace visitor ticket (${uid})`,
      expiresAt,
      idempotencyKey,
      customerEmail: (await this.getUserEmail(uid, prisma)) ?? undefined,
      successUrl: process.env.TICKET_CHECKOUT_SUCCESS_URL,
      cancelUrl: process.env.TICKET_CHECKOUT_CANCEL_URL,
      // reference จะเติมหลังสร้าง payment เสร็จ (ต้องเป็น paymentId จริง)
      reference: '',
    });

    // ใช้เวลาหมดอายุชุดเดียวกันทั้งฐานข้อมูลและ gateway
    const preparedExpiresAt = prepared.expiresAt;

    let created: { ticket: any; payment: any; checkoutPayload: StoredCheckoutPayload };
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
            expiresAt: preparedExpiresAt,
            // จองช่อง "รายการที่เปิดอยู่" ของผู้ใช้ไว้ 1 ช่อง (unique)
            // -> กันไม่ให้มีรายการเปิดพร้อมกันมากกว่า 1 รายการ
            openUid: uid,
          },
        });

        // ประกอบ payload แล้วบันทึก "ภายใน transaction เดียวกัน"
        // -> ถ้าบันทึกไม่สำเร็จ transaction จะ rollback ทั้ง Ticket/Payment
        //    ไม่เหลือรายการที่จอง openUid ไว้แต่กู้ไม่ได้
        const payload = this.buildStoredPayload(prepared, String(payment.paymentId));
        await tx.payment.update({
          where: { paymentId: payment.paymentId },
          data: { checkoutPayload: JSON.stringify(payload) },
        });

        return { ticket, payment, checkoutPayload: payload };
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

    const checkoutPayload = created.checkoutPayload;

    // ---------- 5. เรียก gateway ด้วย payload ที่เตรียมไว้ ----------
    let session: CheckoutSessionResult;
    try {
      session = await gateway.createCheckoutSession(this.toGatewayInput(checkoutPayload));
    } catch (error) {
      throw await this.handleGatewayFailure(created.payment.paymentId, error, prisma);
    }

    // ---------- 6. บันทึกผลจาก gateway ----------
    // ใช้ conditional update: เขียนได้เฉพาะตอนที่รายการยัง "เปิด" อยู่และยังไม่มี gateway reference
    // - ถ้าระหว่างนี้มีคำขออื่นไปยืนยันว่าจ่ายแล้ว (เช่น US6-3 ประมวลผล webhook)
    //   สถานะจะเป็น Paid แล้ว -> ห้ามเขียนย้อนกลับเป็น Pending
    // - ถ้าระหว่างนี้มีอีกคำขอไปกู้ checkout ได้ก่อน -> gateway reference ของรายการนั้นต้องไม่ถูกทับ
    const applied = await prisma.payment.updateMany({
      where: {
        paymentId: created.payment.paymentId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
        gatewayRef: null,
      },
      data: {
        gatewayRef: session.gatewayRef,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt,
        status: PaymentStatus.PENDING,
      },
    });

    if (applied.count === 0) {
      // รายการถูกปิดไปแล้วระหว่างที่เราคุยกับ gateway
      // -> โหลดสถานะล่าสุดมาตอบ ห้ามเขียนทับ
      const latest = await prisma.payment.findUnique({
        where: { paymentId: created.payment.paymentId },
      });
      if (latest) {
        return this.handleExistingPayment(latest, prisma, gateway, now);
      }
    }

    const updated = await prisma.payment.findUnique({
      where: { paymentId: created.payment.paymentId },
    });

    if (!updated) {
      throw {
        status: 500,
        code: 'PAYMENT_NOT_FOUND',
        message: `Payment ${created.payment.paymentId} disappeared during the checkout call`,
      } as TicketPurchaseError;
    }

    return {
      ticketId: created.ticket.ticketId,
      paymentId: updated.paymentId,
      checkoutUrl: updated.checkoutUrl,
      amountSatang: updated.amountSatang,
      currency: updated.currency,
      status: updated.status,
      ticketStatus: created.ticket.status,
      expiresAt: new Date(updated.expiresAt).toISOString(),
      ticketStartDateTime: new Date(created.ticket.startDateTime).toISOString(),
      ticketEndDateTime: new Date(created.ticket.endDateTime).toISOString(),
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
   * แปลง payload ที่เตรียมไว้เป็นรูปแบบที่เก็บลงฐานข้อมูล
   */
  private static buildStoredPayload(
    prepared: CreateCheckoutSessionInput,
    reference: string
  ): StoredCheckoutPayload {
    return {
      amountSatang: prepared.amountSatang,
      currency: prepared.currency,
      reference,
      description: prepared.description,
      expiresAt: prepared.expiresAt.toISOString(),
      idempotencyKey: prepared.idempotencyKey,
      ...(prepared.customerEmail ? { customerEmail: prepared.customerEmail } : {}),
      ...(prepared.successUrl ? { successUrl: prepared.successUrl } : {}),
      ...(prepared.cancelUrl ? { cancelUrl: prepared.cancelUrl } : {}),
    };
  }

  /**
   * แปลง payload ที่เก็บไว้กลับเป็น input ของ gateway
   * ใช้ตอน retry เพื่อให้ส่งพารามิเตอร์ชุดเดิมเป๊ะ ๆ
   */
  private static toGatewayInput(payload: StoredCheckoutPayload): CreateCheckoutSessionInput {
    return {
      amountSatang: payload.amountSatang,
      currency: payload.currency,
      reference: payload.reference,
      description: payload.description,
      expiresAt: new Date(payload.expiresAt),
      idempotencyKey: payload.idempotencyKey,
      ...(payload.customerEmail ? { customerEmail: payload.customerEmail } : {}),
      ...(payload.successUrl ? { successUrl: payload.successUrl } : {}),
      ...(payload.cancelUrl ? { cancelUrl: payload.cancelUrl } : {}),
    };
  }

  /**
   * อ่าน payload ที่เก็บไว้จากรายการ
   */
  private static readStoredPayload(payment: any): StoredCheckoutPayload | null {
    if (!payment?.checkoutPayload) return null;
    try {
      return JSON.parse(payment.checkoutPayload) as StoredCheckoutPayload;
    } catch {
      return null;
    }
  }

  /**
   * อ่านราคา/อายุตั๋วจาก SystemConfig
   * ------------------------------------------------------------------
   * ห้าม fallback เป็นค่า default เมื่ออ่านไม่ได้หรือค่าไม่ถูกต้อง
   * เพราะจะทำให้เรียกเก็บเงินผิดราคา (เช่นเก็บ 50 บาท แทนราคาจริง)
   */
  private static async readPricingConfig(
    prisma: any,
    gateway: PaymentGateway
  ): Promise<TicketPricingConfig> {
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

    // อายุ checkout ต้องอยู่ในช่วงที่ gateway รองรับจริง
    // ถ้าไม่ตรวจตรงนี้ adapter จะ "ขยาย" ค่าให้อัตโนมัติ -> เวลาหมดอายุในฐานข้อมูล
    // จะไม่ตรงกับที่ gateway ใช้จริง -> อาจปิดรายการทั้งที่ checkout ยังเปิดอยู่
    if (
      expiryMinutes < gateway.minCheckoutExpiryMinutes ||
      expiryMinutes > gateway.maxCheckoutExpiryMinutes
    ) {
      console.error(
        `[TicketService] paymentCheckoutExpiryMinutes=${expiryMinutes} is outside the range supported by gateway "${gateway.name}" (${gateway.minCheckoutExpiryMinutes}-${gateway.maxCheckoutExpiryMinutes})`
      );
      throw {
        status: 503,
        code: 'INVALID_CHECKOUT_EXPIRY',
        message: `Checkout expiry must be between ${gateway.minCheckoutExpiryMinutes} and ${gateway.maxCheckoutExpiryMinutes} minutes for the configured payment gateway. (No charge was made.)`,
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
   * หลักการ: **ห้ามปิดรายการจากเวลาฝั่ง DB อย่างเดียว**
   *   เวลาในฐานข้อมูลอาจผ่านไปแล้ว แต่ checkout ที่ gateway สร้างไว้ยังเปิดอยู่
   *   -> ต้องถาม gateway ก่อนเสมอ แล้วค่อยตัดสินใจ
   *
   * - มี gatewayRef -> ดึงสถานะจริงจาก gateway
   *   - open      : ยังจ่ายได้ -> เก็บช่องไว้ คืนรายการเดิม
   *   - paid      : จ่ายแล้ว -> บันทึกสถานะ (การเปิดใช้ตั๋วเป็นหน้าที่ของ US6-3)
   *   - expired   : หมดอายุ -> ปิดรายการ ปล่อยให้ซื้อใหม่ได้
   *   - not_found : gateway ไม่เคยสร้าง -> ปิดรายการ ปล่อยให้ซื้อใหม่ได้
   *   - unknown   : ตรวจไม่ได้ -> คงสถานะรอตรวจสอบ ห้ามปล่อยช่อง
   * - ไม่มี gatewayRef -> ใช้ payload + key เดิมยิง gateway ซ้ำเพื่อกู้ session เดิม
   */
  private static async reconcileOpenPayment(
    payment: any,
    gateway: PaymentGateway,
    prisma: any,
    now: Date
  ): Promise<any | null> {
    // ---------- กรณีที่มี gatewayRef: ถาม gateway ว่าสถานะจริงเป็นอะไร ----------
    if (payment.gatewayRef) {
      const status = await gateway.retrieveCheckoutStatus(payment.gatewayRef);

      if (status.state === 'paid') {
        // จ่ายแล้วจริง -> บันทึกสถานะให้ตรงกับ gateway
        // (การเปิดใช้ตั๋วเป็นหน้าที่ของ US6-3 ผ่าน webhook)
        return await prisma.payment.update({
          where: { paymentId: payment.paymentId },
          data: {
            status: PaymentStatus.PAID,
            paidAt: status.paidAt ?? new Date(),
            openUid: null,
          },
        });
      }

      if (status.state === 'expired' || status.state === 'not_found') {
        // gateway ยืนยันว่าใช้ไม่ได้แล้ว -> ปิดรายการ ปล่อยให้ซื้อใหม่ได้
        await prisma.payment.updateMany({
          where: {
            paymentId: payment.paymentId,
            status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
          },
          data: { status: PaymentStatus.EXPIRED, openUid: null },
        });
        return null;
      }

      if (status.state === 'open') {
        // checkout ยังเปิดอยู่ที่ gateway -> เก็บช่องไว้ ห้ามปล่อยให้ซื้อใหม่
        return payment;
      }

      // unknown -> ตรวจสอบไม่ได้ ห้ามปิดรายการจากเวลาฝั่ง DB
      console.error(
        `[TicketService] Could not confirm the state of payment #${payment.paymentId} with the gateway; keeping it open.`
      );
      await prisma.payment.updateMany({
        where: {
          paymentId: payment.paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
        },
        data: { status: PaymentStatus.UNCONFIRMED },
      });
      return payment;
    }

    // ---------- กรณีไม่มี gatewayRef: กู้ด้วย payload + key เดิม ----------
    const payload = this.readStoredPayload(payment);

    if (!payload) {
      // ไม่มี payload และไม่มี gatewayRef -> ยืนยันไม่ได้ว่า gateway สร้าง session ไหม
      // -> คงสถานะรอตรวจสอบ ห้ามปล่อยช่องให้ซื้อใหม่
      console.error(
        `[TicketService] Payment #${payment.paymentId} has neither a gateway reference nor a stored checkout payload; keeping it open.`
      );
      await prisma.payment.updateMany({
        where: {
          paymentId: payment.paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
        },
        data: { status: PaymentStatus.UNCONFIRMED },
      });
      return payment;
    }

    try {
      // ใช้ payload ชุดเดิม + idempotency key เดิม
      // -> gateway จะคืน session เดิม (ไม่สร้างใหม่ และไม่ปฏิเสธเพราะพารามิเตอร์ตรงกัน)
      const session = await gateway.createCheckoutSession(this.toGatewayInput(payload));

      // conditional update: ห้ามเขียนทับรายการที่ถูกปิดไปแล้ว (เช่น จ่ายแล้ว)
      // และห้ามทับ gateway reference ที่ถูกกู้มาเรียบร้อยแล้ว
      const applied = await prisma.payment.updateMany({
        where: {
          paymentId: payment.paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
          gatewayRef: null,
        },
        data: {
          gatewayRef: session.gatewayRef,
          checkoutUrl: session.checkoutUrl,
          expiresAt: session.expiresAt,
          status: PaymentStatus.PENDING,
        },
      });

      if (applied.count === 0) {
        // รายการถูกปิดไปแล้วระหว่างที่เราคุยกับ gateway -> คืนสถานะล่าสุด
        return await prisma.payment.findUnique({
          where: { paymentId: payment.paymentId },
        });
      }

      return await prisma.payment.findUnique({
        where: { paymentId: payment.paymentId },
      });
    } catch (error) {
      // กู้ไม่ได้ -> เก็บสถานะรอตรวจสอบไว้ ห้ามสร้างรายการใหม่
      // (ถ้ามี gateway reference แล้ว แปลว่ามีคำขออื่นกู้สำเร็จไปแล้ว -> ไม่ต้องแตะ)
      console.error(`[TicketService] Could not reconcile payment #${payment.paymentId}:`, error);
      await prisma.payment.updateMany({
        where: {
          paymentId: payment.paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
          gatewayRef: null,
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
        where: {
          paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.UNCONFIRMED] },
          // ถ้ามี gateway reference แล้ว แปลว่ามีคำขออื่นกู้สำเร็จไปแล้ว
          // -> ไม่ต้องเขียนทับสถานะของมัน
          gatewayRef: null,
        },
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
  /**
   * [US6-2] ดึงตั๋วทั้งหมดของผู้ใช้พร้อมประวัติการชำระเงิน
   */
  static async getMyTickets(uid: number) {
    // query ดึงข้อมูลตั๋วพร้อม payment ที่ผูกกับตั๋ว
    const tickets = await prisma.ticket.findMany({
      where: { uid: uid },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            paymentId: true,
            amountSatang: true,
            currency: true,
            status: true,
            gateway: true,
            ticketValidityHours: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // เนื่องจากดึงมาด้วย include Prisma จะรับรู้ Type ว่า ticket มี payments แล้ว
    // ถ้ายังติดตัวแดงเรื่อง Type สามารถใส่ any ในวงเล็บได้เป็น (ticket: any)
    return tickets.map((ticket: any) => ({
      ticketId: ticket.ticketId,
      status: ticket.status,
      startDateTime: ticket.startDateTime,
      endDateTime: ticket.endDateTime,
      createdAt: ticket.createdAt,
      // ใส่ fallback [] กรณีที่ไม่มีประวัติชำระเงิน
      payments: ticket.payments || [],
    }));
  }
}

export default TicketService;
