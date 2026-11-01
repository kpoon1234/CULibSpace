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
 */

/**
 * ส่วนของ Stripe SDK ที่ adapter ใช้จริง
 * -------------------------------------------------------------------------
 * ทำเป็น interface เพื่อให้เทสต์สามารถ mock "เฉพาะ SDK" ได้
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
  apiVersion?: Stripe.LatestApiVersion;
  timeoutMs?: number;
  client?: StripeCheckoutClient;
}

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

    const expiresAt = input.expiresAt;

    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
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

  async retrieveCheckoutStatus(gatewayRef: string): Promise<GatewayCheckoutStatus> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(gatewayRef);

      const object = session as unknown as Record<string, unknown>;
      const metadata = object['metadata'] as { reference?: string } | undefined;

      let state: GatewayCheckoutState = 'unknown';
      if (session.status === 'expired') {
        state = 'expired';
      } else if (session.status === 'complete') {
        // payment_status 'paid'   -> confirmed payment
        // payment_status 'unpaid' -> checkout session เสร็จสิ้นแต่การชำระเงินยัง
        //                            อยู่ระหว่างดำเนินการ (async payment เช่น โอนเงิน)
        //                            Stripe จะส่ง async_payment_succeeded /
        //                            async_payment_failed ทีหลังเพื่อยืนยันผล
        //                            ไม่ถือว่า terminal failure จนกว่าจะมี event นั้น
        //                            -> คืน 'open' เพื่อรักษาช่อง openUid ไว้ ห้ามปล่อยให้ซื้อใหม่
        state = session.payment_status === 'paid' ? 'paid' : 'open';
      } else if (session.status === 'open') {
        state = 'open';
      }

      return {
        state,
        livemode: session.livemode,
        amountSatang: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
        reference: metadata?.reference,
        raw: object,
      };
    } catch (error) {
      const stripeError = error as { statusCode?: number; code?: string; message?: string };

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
      throw new PaymentGatewayError('GATEWAY_REJECTED', 'Invalid Stripe webhook signature', {
        status: 400,
        cause: error,
      });
    }

    // Reject live-mode events before any processing.
    if (event.livemode === true) {
      throw new PaymentGatewayError('GATEWAY_REJECTED', 'Live payment events are disabled.', {
        status: 400,
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

    const paymentState = this.readPaymentState(object);
    const paidAt = this.readPaidAt(object);

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        // Only treat as paid when Stripe explicitly reports payment_status=paid.
        // payment_status=unpaid means checkout completed but payment not yet confirmed.
        if (paymentState === 'paid') {
          return {
            ...identity,
            type: 'payment.succeeded',
            eventId: identity.eventId,
            livemode: identity.livemode,
            gatewayRef,
            reference,
            amountSatang,
            currency,
            paymentState,
            raw: event,
          };
        }
        return {
          ...identity,
          type: 'payment.unknown',
          eventId: identity.eventId,
          livemode: identity.livemode,
          gatewayRef,
          reference,
          amountSatang,
          currency,
          paymentState,
          raw: event,
        };
      case 'checkout.session.async_payment_failed':
      case 'payment_intent.payment_failed':
        return {
          ...identity,
          type: 'payment.failed',
          terminalFailure: event.type === 'checkout.session.async_payment_failed',
          eventId: identity.eventId,
          livemode: identity.livemode,
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
          eventId: identity.eventId,
          livemode: identity.livemode,
          gatewayRef,
          reference,
          amountSatang,
          currency,
          paymentState,
          raw: event,
        };
      default:
        return {
          ...identity,
          type: 'payment.unknown',
          eventId: identity.eventId,
          livemode: identity.livemode,
          gatewayRef,
          reference,
          amountSatang,
          currency,
          paymentState,
          raw: event,
        };
    }
  }

  private readPaymentState(object: Record<string, unknown>): GatewayPaymentState {
    const raw = object['payment_status'];
    if (raw === 'paid') return 'paid';
    if (raw === 'unpaid') return 'unpaid';
    if (raw === 'no_payment_required') return 'no_payment_required';
    return 'unknown';
  }

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

    if (!paymentIntent || typeof paymentIntent === 'string') {
      return undefined;
    }

    if (paymentIntent.status !== 'succeeded') {
      return undefined;
    }

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

  private clampExpiry(requested: Date): Date {
    const now = Date.now();
    const min = now + STRIPE_MIN_CHECKOUT_EXPIRY_MINUTES * 60 * 1000;
    const max = now + STRIPE_MAX_CHECKOUT_EXPIRY_MINUTES * 60 * 1000;
    const target = requested.getTime();
    return new Date(Math.min(Math.max(target, min), max));
  }

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
