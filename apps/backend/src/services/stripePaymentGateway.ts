import Stripe from 'stripe';
import {
  PaymentGateway,
  PaymentGatewayError,
  CreateCheckoutSessionInput,
  CheckoutSessionResult,
  GatewayPaymentEvent,
  GatewayPaymentState,
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

export interface StripeGatewayOptions {
  secretKey: string;
  webhookSecret?: string;
  /** ค่า default ของ Stripe คือ 'auto' (ใช้ key ที่ตั้งไว้ใน dashboard) */
  apiVersion?: Stripe.LatestApiVersion;
  /** timeout ของการเรียก gateway (มิลลิวินาที) */
  timeoutMs?: number;
}

/** Stripe บังคับให้ expires_at อยู่ระหว่าง 30 นาที ถึง 24 ชั่วโมงนับจากตอนสร้าง */
export const STRIPE_MIN_CHECKOUT_EXPIRY_MINUTES = 30;
export const STRIPE_MAX_CHECKOUT_EXPIRY_MINUTES = 24 * 60;

export class StripePaymentGateway implements PaymentGateway {
  readonly name = 'stripe';
  private readonly stripe: Stripe;
  private readonly webhookSecret?: string;
  private readonly timeoutMs: number;

  constructor(options: StripeGatewayOptions) {
    if (!options.secretKey) {
      throw new PaymentGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'Stripe secret key is not configured'
      );
    }

    this.stripe = new Stripe(options.secretKey, {
      ...(options.apiVersion ? { apiVersion: options.apiVersion } : {}),
      timeout: options.timeoutMs ?? 10_000,
      maxNetworkRetries: 1,
    });
    this.webhookSecret = options.webhookSecret;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    this.assertAmount(input.amountSatang);
    this.assertCurrency(input.currency);

    const expiresAt = this.clampExpiry(input.expiresAt);

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
   * - payment_intent.created  : เวลาที่สร้าง payment intent (ใกล้เคียงเวลาจ่ายจริง)
   * - payment_intent.status    : 'succeeded' เท่านั้นที่ถือว่าจ่ายสำเร็จ
   * ถ้าไม่มีข้อมูล payment intent (ต้อง expand ตอนเรียก API) -> คืน undefined
   * เพื่อไม่ให้เกิด timestamp ผิด
   */
  private readPaidAt(object: Record<string, unknown>): Date | undefined {
    const paymentIntent = object['payment_intent'] as
      | { id?: string; created?: number; status?: string; latest_charge?: { created?: number } }
      | string
      | undefined;

    if (!paymentIntent || typeof paymentIntent === 'string') {
      // ไม่มี object ที่ expand มา -> ไม่มีเวลาจ่ายจริงที่เชื่อถือได้
      return undefined;
    }

    if (paymentIntent.status !== 'succeeded') {
      return undefined;
    }

    const chargeCreated = paymentIntent.latest_charge?.created;
    if (typeof chargeCreated === 'number') {
      return new Date(chargeCreated * 1000);
    }

    if (typeof paymentIntent.created === 'number') {
      return new Date(paymentIntent.created * 1000);
    }

    return undefined;
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
      return new PaymentGatewayError('GATEWAY_UNAVAILABLE', message, {
        retryable: true,
        status: 503,
        cause: error,
      });
    }

    if (stripeError?.type === 'StripeTimeoutError' || /timeout/i.test(message)) {
      return new PaymentGatewayError('GATEWAY_TIMEOUT', message, {
        retryable: true,
        status: 504,
        cause: error,
      });
    }

    if (typeof stripeError?.statusCode === 'number' && stripeError.statusCode >= 500) {
      return new PaymentGatewayError('GATEWAY_UNAVAILABLE', message, {
        retryable: true,
        status: 503,
        cause: error,
      });
    }

    return new PaymentGatewayError('GATEWAY_REJECTED', message, {
      retryable: false,
      status: 502,
      cause: error,
    });
  }
}

export default StripePaymentGateway;
