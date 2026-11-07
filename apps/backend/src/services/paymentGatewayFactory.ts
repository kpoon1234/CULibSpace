import { PaymentGateway, PaymentGatewayError } from './paymentGateway.js';
import { StripePaymentGateway } from './stripePaymentGateway.js';
import { config } from '../config.js';

/**
 * [US6-1] Factory สำหรับเลือก Payment Gateway
 * -------------------------------------------------------------------------
 * ตอนนี้รองรับ Stripe (test mode) เป็น gateway เดียว
 * ทีม US6-2 / US6-3 สามารถเพิ่ม provider อื่นได้โดยแก้แค่ไฟล์นี้
 *
 * ตัวแปร environment ที่รองรับ:
 *   STRIPE_SECRET_KEY       - test mode key (sk_test_...) จำเป็น
 *   STRIPE_WEBHOOK_SECRET   - signing secret ของ webhook จำเป็นสำหรับรับ webhook
 *   PAYMENT_GATEWAY         - ชื่อ gateway ที่ต้องการใช้ (default: stripe)
 */

export const SUPPORTED_GATEWAYS = ['stripe'] as const;

export type SupportedGateway = (typeof SUPPORTED_GATEWAYS)[number];

export function getPaymentGateway(): PaymentGateway {
  const requested = (process.env.PAYMENT_GATEWAY ?? 'stripe').toLowerCase();

  if (requested === 'stripe') {
    const secretKey = config.stripe.secretKey;

    if (!secretKey) {
      throw new PaymentGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'STRIPE_SECRET_KEY is not set. Add it to apps/backend/.env to enable ticket purchase.',
        { status: 500 }
      );
    }
    if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(secretKey)) {
      throw new PaymentGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'This demo requires a Stripe test/sandbox API key; live keys are disabled.',
        { status: 500 }
      );
    }

    return new StripePaymentGateway({
      secretKey,
      webhookSecret: config.stripe.webhookSecret,
      timeoutMs: config.stripe.timeoutMs,
    });
  }

  throw new PaymentGatewayError(
    'GATEWAY_NOT_CONFIGURED',
    `Unsupported payment gateway "${requested}". Supported: ${SUPPORTED_GATEWAYS.join(', ')}`,
    { status: 500 }
  );
}

export default getPaymentGateway;
