import Stripe from 'stripe';
import {
  PaymentGateway,
  PaymentGatewayError,
  CreateCheckoutSessionInput,
  CheckoutSessionResult,
  GatewayPaymentEvent,
  GatewayPaymentState,
  GatewayCheckoutState,
  GatewayCheckoutStatus,
} from './paymentGateway.js';

/**
 * [US6-1] Stripe Payment Gateway (test mode)
 * -------------------------------------------------------------------------
 * ใช้ Stripe Checkout Sessions เป็น redirect flow:
 *   Backend -> Stripe Checkout Session -> ผู้ใช้ชำระเงิน -> Stripe webhook -> Backend
 *
 * ข้อดีของ Checkout Session เหนือ PaymentIntent:
 *   - Stripe จัดการหน้า checkout และการรับเงินให้เราเอง (hosted page)
 *   - มี idempotency key ระดับ request อยู่แล้ว
 *   - ส่ง webhook มาตอน checkout.session.completed / .expired
 */

/**
 * ส่วนของ Stripe SDK ที่ adapter ใช้จริง
 * -------------------------------------------------------------------------
 * ทำเป็น interface เพื่อให้เทสต์สามารถ mock "เฉพาะ SDK" ได้
 * โดยที่ยังทดสอบตรรกะของ adapter จริง (การ clamp expiry, การแปลง error, การ map event)
 */
export interface StripeCheckoutClient {
  checkout: {
    sessions: {
      create(params: any, options?: any): Promise<any>;
      retrieve(id: string, params?: any): Promise<any>;
    };
  };
  webhooks: {
    constructEvent(payload: Buffer | string, header: string, secret: string): any;
  };
}

export interface StripeGatewayOptions {
  secretKey: string;
  webhookSecret?: string;
  /** ค่า default ของ Stripe คือ 'auto' (ใช้ key ที่ตั้งไว้ใน dashboard) */
  apiVersion?: Stripe.LatestApiVersion;
  /** timeout ของการเรียก gateway (มิลลิวินาที) */
  timeoutMs?: number;
  /** inject ได้สำหรับทดสอบ (ถ้าไม่ระบุจะสร้าง Stripe client จริง) */
  client?: StripeCheckoutClient;
}

/** Stripe บังคับให้ expires_at อยู่ระหว่าง 30 นาที ถึง 24 ชั่วโมงนับจากตอนสร้าง */
export const STRIPE_MIN_CHECKOUT_EXPIRY_MINUTES = 30;
export const STRIPE_MAX_CHECKOUT_EXPIRY_MINUTES = 24 * 60;

export class StripePaymentGateway implements PaymentGateway {
  readonly name = 'stripe';
  readonly minCheckoutExpiryMinutes = STRIPE_MIN_CHECKOUT_EXPIRY_MINUTES;
  readonly maxCheckoutExpiryMinutes = STRIPE_MAX_CHECKOUT_EXPIRY_MINUTES;
  private readonly stripe: StripeCheckoutClient;
  private readonly webhookSecret?: string;

  constructor(options: StripeGatewayOptions) {
    if (!options.secretKey && !options.client) {
      throw new PaymentGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'Stripe secret key is not configured'
      );
    }

    this.stripe =
      options.client ??
      (new Stripe(options.secretKey, {
        ...(options.apiVersion ? { apiVersion: options.apiVersion } : {}),
        timeout: options.timeoutMs ?? 10_000,
        maxNetworkRetries: 1,
      }) as unknown as StripeCheckoutClient);
    this.webhookSecret = options.webhookSecret;
  }

  /**
   * ปรับ input ให้อยู่ในช่วงที่ Stripe รองรับ
   * -------------------------------------------------------------------------
   * ต้องถูกเรียก **ครั้งเดียวตอนสร้างรายการ** แล้วเก็บผลลัพธ์ไว้ในฐานข้อมูล
   * ถ้าคำนวณใหม่ตอน retry เวลาอ้างอิงจะเลื่อนตามเวลาจริง
   * -> Stripe จะปฏิเสธการใช้ idempotency key เดิมเพราะพารามิเตอร์ไม่ตรงกัน
   */
  prepareCheckoutSession(input: CreateCheckoutSessionInput): CreateCheckoutSessionInput {
    this.assertAmount(input.amountSatang);
    this.assertCurrency(input.currency);

    return {
      ...input,
      expiresAt: this.clampExpiry(input.expiresAt),
    };
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    this.assertAmount(input.amountSatang);
    this.assertCurrency(input.currency);

    // ใช้ expiresAt ตามที่เตรียมไว้เป๊ะ ๆ ห้าม clamp ซ้ำที่นี่
    // (ถ้า clamp ซ้ำ ค่าจะเลื่อนตามเวลาที่ retry -> Stripe ปฏิเสธ idempotency key เดิม)
    const expiresAt = input.expiresAt;

    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          // Stripe ใช้หน่วยเล็กสุดของสกุลเงิน -> สำหรับ THB คือ satang (ส่งค่าเดียวกันได้)
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: input.currency.toLowerCase(),
                unit_amount: input.amountSatang,
                product_data: {
                  name: input.description,
                },
              },
            },
          ],
          // ใส่ reference กลับเข้าระบบไว้ทั้งที่ session และ payment intent
          metadata: { reference: input.reference },
          payment_intent_data: { metadata: { reference: input.reference } },
          expires_at: Math.floor(expiresAt.getTime() / 1000),
          ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
          ...(input.successUrl ? { success_url: input.successUrl } : {}),
          ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
        },
        { idempotencyKey: input.idempotencyKey }
      );

      if (!session.url || !session.id) {
        throw new PaymentGatewayError(
          'GATEWAY_INVALID_RESPONSE',
          'Stripe returned a checkout session without a redirect URL'
        );
      }

      return {
        gatewayRef: session.id,
        checkoutUrl: session.url,
        expiresAt: new Date((session.expires_at ?? Math.floor(expiresAt.getTime() / 1000)) * 1000),
      };
    } catch (error) {
      throw this.toGatewayError(error);
    }
  }

  /**
   * ดึงสถานะจริงของ checkout session จาก Stripe
   * ใช้ตัดสินว่าจะปิดรายการในฝั่งเราได้หรือยัง
   * (ห้ามปิดรายการจากเวลาฝั่ง DB อย่างเดียว เพราะ checkout ที่ gateway สร้างไว้
   *  อาจยังเปิดอยู่แม้เวลาในฐานข้อมูลผ่านไปแล้ว)
   */
  async retrieveCheckoutStatus(gatewayRef: string): Promise<GatewayCheckoutStatus> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(gatewayRef, {
        expand: ['payment_intent.latest_charge'],
      });

      const object = session as unknown as Record<string, unknown>;
      const metadata = object['metadata'] as { reference?: string } | undefined;

      let state: GatewayCheckoutState = 'unknown';
      if (session.status === 'expired') {
        state = 'expired';
      } else if (session.status === 'complete') {
        state = session.payment_status === 'paid' ? 'paid' : 'unknown';
      } else if (session.status === 'open') {
        state = 'open';
      }

      return {
        state,
        livemode: session.livemode,
        amountSatang: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
        reference: metadata?.reference,
        paidAt: this.readPaidAt(object),
        raw: object,
      };
    } catch (error) {
      const stripeError = error as { statusCode?: number; code?: string; message?: string };

      // Stripe ตอบ 404 = ไม่มี session นี้ (ไม่เคยถูกสร้าง)
      if (stripeError?.statusCode === 404 || stripeError?.code === 'resource_missing') {
        return { state: 'not_found', raw: error };
      }

      // ตรวจสอบไม่ได้ -> ไม่ต้องปิดรายการ (ปลอดภัยกว่า)
      // Stripe error messages may include part of an API key. Never log the raw error.
      console.error('[StripePaymentGateway] Could not retrieve checkout status.');
      return { state: 'unknown', raw: error };
    }
  }

  async parseWebhookEvent(rawBody: Buffer, signature: string): Promise<GatewayPaymentEvent> {
    if (!this.webhookSecret) {
      throw new PaymentGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'Stripe webhook secret is not configured'
      );
    }
    if (!signature) {
      throw new PaymentGatewayError('GATEWAY_REJECTED', 'Missing Stripe-Signature header', {
        status: 400,
      });
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      // ลายเซ็นไม่ถูกต้อง = คำขอไม่น่าเชื่อถือ ต้องปฏิเสธ (ไม่ใช่ gateway ล่ม)
      throw new PaymentGatewayError('GATEWAY_REJECTED', 'Invalid Stripe webhook signature', {
        status: 400,
        cause: error,
      });
    }

    return this.mapEvent(event);
  }

  private mapEvent(event: Stripe.Event): GatewayPaymentEvent {
    if (event.livemode === true) {
      throw new PaymentGatewayError('GATEWAY_REJECTED', 'Live payment events are disabled.', {
        status: 400,
      });
    }
    const identity = { eventId: event.id, livemode: event.livemode };
    const raw = event as unknown as { data?: { object?: Record<string, unknown> } };
    const object = raw.data?.object ?? {};

    const gatewayRef =
      (object['id'] as string | undefined) ??
      (event.data?.object as { id?: string } | undefined)?.id ??
      '';

    const metadata = object['metadata'] as { reference?: string } | undefined;
    const reference = metadata?.reference;
    const amountSatang = (object['amount_total'] as number | undefined) ?? undefined;
    const currency = (object['currency'] as string | undefined) ?? undefined;

    // สถานะการจ่ายเงินจริงจาก gateway (ไม่เท่ากับ "session completed")
    const paymentState = this.readPaymentState(object);

    // เวลาที่ชำระเงินสำเร็จจริง
    // ต้องมาจาก payment intent (จ่ายสำเร็จเมื่อไร) ไม่ใช่ session.created
    // เพราะ session.created คือเวลาที่ผู้ใช้ยังกำลังกรอกข้อมูลอยู่
    const paidAt = this.readPaidAt(object);

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        // session completed ไม่ได้แปลว่าจ่ายสำเร็จเสมอ (เช่น จ่ายด้วยวิธีที่ต้องรอ)
        // ต้องเช็ค payment_state จริงด้วย
        if (paymentState === 'paid' || paymentState === 'no_payment_required') {
          return {
            ...identity,
            type: 'payment.succeeded',
            gatewayRef,
            reference,
            amountSatang,
            currency,
            paymentState,
            paidAt,
            raw: event,
          };
        }
        return {
          ...identity,
          type: 'payment.unknown',
          gatewayRef,
          reference,
          amountSatang,
          currency,
          paymentState,
          paidAt,
          raw: event,
        };
      case 'checkout.session.async_payment_failed':
      case 'payment_intent.payment_failed':
        return {
          ...identity,
          type: 'payment.failed',
          gatewayRef,
          reference,
          amountSatang,
          currency,
          paymentState,
          raw: event,
        };
      case 'checkout.session.expired':
        return {
          ...identity,
          type: 'payment.expired',
          gatewayRef,
          reference,
          amountSatang,
          currency,
          paymentState,
          raw: event,
        };
      default:
        // event อื่นที่เรายังไม่สนใจ -> ให้ caller จัดการแบบ no-op
        return {
          ...identity,
          type: 'payment.unknown',
          gatewayRef,
          reference,
          amountSatang,
          currency,
          paymentState,
          raw: event,
        };
    }
  }

  /**
   * อ่านสถานะการจ่ายเงินจริงจาก payload
   */
  private readPaymentState(object: Record<string, unknown>): GatewayPaymentState {
    const raw = object['payment_status'];
    if (raw === 'paid') return 'paid';
    if (raw === 'unpaid') return 'unpaid';
    if (raw === 'no_payment_required') return 'no_payment_required';
    return 'unknown';
  }

  /**
   * อ่านเวลาที่ชำระเงินสำเร็จจริง
   * -------------------------------------------------------------------------
   * ใช้ได้เฉพาะ "เวลาที่เกิดการเรียกเก็บเงินจริง" (charge) เท่านั้น
   * - payment_intent.created  = เวลาสร้าง PaymentIntent ไม่ใช่เวลาจ่าย -> ใช้ไม่ได้
   * - latest_charge.created    = เวลาที่เกิดการเรียกเก็บเงินจริง -> ใช้ได้
   *
   * ถ้าไม่มีข้อมูลที่เชื่อถือได้ -> คืน undefined
   * ให้ US6-3 ดึงข้อมูลการชำระเงินเพิ่มเติมหรือกำหนดเวลาเปิดใช้ตั๋วตามนโยบายที่ตกลงกัน
   * (ห้ามใช้เวลาสร้าง session / PaymentIntent แทนเวลาจ่าย)
   */
  private readPaidAt(object: Record<string, unknown>): Date | undefined {
    const paymentIntent = object['payment_intent'] as
      | {
          id?: string;
          created?: number;
          status?: string;
          latest_charge?: { created?: number } | string | null;
        }
      | string
      | null
      | undefined;

    // ไม่มี payment intent ที่ expand มา -> ไม่มีเวลาจ่ายจริงที่เชื่อถือได้
    if (!paymentIntent || typeof paymentIntent === 'string') {
      return undefined;
    }

    // PaymentIntent ยังไม่สำเร็จ -> ยังไม่มีเวลาจ่าย
    if (paymentIntent.status !== 'succeeded') {
      return undefined;
    }

    // latest_charge ต้องเป็น object ที่มีข้อมูลเวลาจริง
    // ถ้าเป็นแค่ id (string) หรือไม่มี -> ไม่มีเวลาจ่ายที่เชื่อถือได้
    const charge = paymentIntent.latest_charge;
    if (!charge || typeof charge !== 'object' || typeof charge.created !== 'number') {
      return undefined;
    }

    return new Date(charge.created * 1000);
  }

  private assertAmount(amountSatang: number): void {
    if (!Number.isInteger(amountSatang) || amountSatang <= 0) {
      throw new PaymentGatewayError(
        'GATEWAY_REJECTED',
        `Invalid amount in satang: ${amountSatang}`,
        { status: 500 }
      );
    }
  }

  private assertCurrency(currency: string): void {
    if (!currency || currency.length !== 3) {
      throw new PaymentGatewayError('GATEWAY_REJECTED', `Invalid currency code: ${currency}`, {
        status: 500,
      });
    }
  }

  /** Stripe บังคับให้ expires_at อยู่ในช่วง 30 นาที - 24 ชั่วโมง */
  private clampExpiry(requested: Date): Date {
    const now = Date.now();
    const min = now + STRIPE_MIN_CHECKOUT_EXPIRY_MINUTES * 60 * 1000;
    const max = now + STRIPE_MAX_CHECKOUT_EXPIRY_MINUTES * 60 * 1000;
    const target = requested.getTime();
    return new Date(Math.min(Math.max(target, min), max));
  }

  /** แปลง error ของ Stripe ให้เป็น PaymentGatewayError ที่มีความหมายชัดเจน */
  private toGatewayError(error: unknown): PaymentGatewayError {
    if (error instanceof PaymentGatewayError) return error;

    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      statusCode?: number;
    };

    const message = stripeError?.message || 'Unknown payment gateway error';

    if (stripeError?.type === 'StripeConnectionError' || stripeError?.type === 'StripeAPIError') {
      return new PaymentGatewayError('GATEWAY_UNAVAILABLE', 'Stripe is temporarily unavailable.', {
        retryable: true,
        status: 503,
        cause: error,
      });
    }

    if (stripeError?.type === 'StripeTimeoutError' || /timeout/i.test(message)) {
      return new PaymentGatewayError('GATEWAY_TIMEOUT', 'Stripe request timed out.', {
        retryable: true,
        status: 504,
        cause: error,
      });
    }

    if (typeof stripeError?.statusCode === 'number' && stripeError.statusCode >= 500) {
      return new PaymentGatewayError('GATEWAY_UNAVAILABLE', 'Stripe is temporarily unavailable.', {
        retryable: true,
        status: 503,
        cause: error,
      });
    }

    // Stripe's authentication error can include part of the supplied secret.
    // Do not expose its raw message to purchase API callers.
    return new PaymentGatewayError('GATEWAY_REJECTED', 'Stripe rejected the checkout request.', {
      retryable: false,
      status: 502,
      cause: error,
    });
  }
}

export default StripePaymentGateway;
