import express, { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { getPaymentGateway } from '../services/paymentGatewayFactory.js';
import { PaymentGatewayError, type PaymentGateway } from '../services/paymentGateway.js';
import {
  PaymentConfirmationError,
  PaymentConfirmationService,
} from '../services/paymentConfirmationService.js';

/** Mount before express.json(). Uses a Stripe signature, NOT a user's JWT. */
export function createPaymentWebhookRouter(
  gatewayFactory: () => PaymentGateway = getPaymentGateway,
  prisma?: PrismaClient
) {
  const router = Router();
  router.post(
    '/payment/webhook',
    express.raw({ type: 'application/json', limit: '256kb' }),
    async (req, res) => {
      const signature = req.get('Stripe-Signature');
      if (!signature || !Buffer.isBuffer(req.body)) {
        res.status(400).json({ received: false, code: 'INVALID_WEBHOOK_REQUEST' });
        return;
      }
      let eventId: string | undefined;
      try {
        const gateway = gatewayFactory();
        const event = await gateway.parseWebhookEvent(req.body, signature);
        eventId = event.eventId;
        const result = await PaymentConfirmationService.handleWebhook(event, gateway, prisma);
        res.status(200).json({ received: true, ...result });
      } catch (error) {
        if (error instanceof PaymentConfirmationError) {
          // Signed but permanently mismatched data needs operator attention, not
          // repeated activation attempts. Do not expose payment/customer details.
          console.warn('[PaymentWebhook]', { code: error.code, eventId });
          res
            .status(error.status >= 500 ? 503 : 200)
            .json({ received: true, handled: false, code: error.code });
        } else if (error instanceof PaymentGatewayError) {
          res.status(error.status === 400 ? 400 : 503).json({ received: false, code: error.code });
        } else {
          console.error('[PaymentWebhook] Database/processing failure; delivery must retry.', {
            eventId,
          });
          res.status(503).json({ received: false, code: 'PAYMENT_PROCESSING_UNAVAILABLE' });
        }
      }
    }
  );
  return router;
}
