import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { TicketService } from '../services/ticketService.js';
import { getPaymentGateway } from '../services/paymentGatewayFactory.js';
import { PaymentGatewayError } from '../services/paymentGateway.js';

const MAX_IDEMPOTENCY_KEY_LENGTH = 64;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * [US6-1] Visitor Ticket Controller
 */
export class TicketController {
  /**
   * POST /api/tickets/purchase
   * ซื้อตั๋วเข้าใช้บริการสำหรับบุคคลภายนอก
   *
   * Body (ทั้งหมดเป็น optional):
   *   { "idempotencyKey": "client-generated-uuid" }
   *
   * หมายเหตุ: ราคาและอายุใช้งานตั๋วถูกกำหนดโดย Backend จาก SystemConfig เท่านั้น
   */
  static async purchase(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const uid = authReq.user?.uid;

      if (!uid) {
        res.status(401).json({ success: false, error: 'Unauthorized: User session required' });
        return;
      }

      const body = (req.body ?? {}) as { idempotencyKey?: unknown };
      const idempotencyKey = this.parseIdempotencyKey(body.idempotencyKey);

      if (idempotencyKey === null) {
        res.status(400).json({
          success: false,
          code: 'INVALID_IDEMPOTENCY_KEY',
          error: `idempotencyKey must match ${IDEMPOTENCY_KEY_PATTERN} and be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
        });
        return;
      }

      const gateway = getPaymentGateway();

      const result = await TicketService.purchase({ uid, idempotencyKey }, gateway);

      res.status(200).json({
        success: true,
        data: {
          ticketId: result.ticketId,
          paymentId: result.paymentId,
          checkoutUrl: result.checkoutUrl,
          amountSatang: result.amountSatang,
          currency: result.currency,
          paymentStatus: result.status,
          ticketStatus: result.ticketStatus,
          expiresAt: result.expiresAt,
          ticketStartDateTime: result.ticketStartDateTime,
          ticketEndDateTime: result.ticketEndDateTime,
          replayed: result.replayed,
        },
      });
    } catch (error: any) {
      this.handleError(res, error, 'Error purchasing ticket');
    }
  }

  /**
   * GET /api/tickets/my-tickets
   * ดูตั๋วของตัวเองทั้งหมด พร้อมประวัติการชำระเงิน
   */
  static async myTickets(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const uid = authReq.user?.uid;

      if (!uid) {
        res.status(401).json({ success: false, error: 'Unauthorized: User session required' });
        return;
      }

      const tickets = await TicketService.myTickets(uid);

      res.status(200).json({ success: true, data: { tickets } });
    } catch (error: any) {
      this.handleError(res, error, 'Error fetching my tickets');
    }
  }

  /**
   * POST /api/tickets/payment/webhook
   * รับการแจ้งเตือนจาก Payment Gateway (Stripe)
   *
   * หมายเหตุ: route นี้ถูก mount ก่อน express.json() เพื่อให้ได้ raw body
   * ที่จำเป็นสำหรับตรวจสอบลายเซ็นของ Stripe
   */
  static async paymentWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'];
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

      if (!rawBody.length) {
        res.status(400).json({ success: false, error: 'Empty webhook body' });
        return;
      }

      const gateway = getPaymentGateway();
      const event = await gateway.parseWebhookEvent(
        rawBody,
        typeof signature === 'string' ? signature : ''
      );

      if (event.type === 'payment.unknown') {
        // event ที่เรายังไม่สนใจ -> ตอบ 200 เพื่อไม่ให้ gateway retry
        res.status(200).json({ success: true, data: { received: true, handled: false } });
        return;
      }

      const outcome =
        event.type === 'payment.succeeded'
          ? 'succeeded'
          : event.type === 'payment.failed'
            ? 'failed'
            : 'expired';

      const result = await TicketService.confirmPayment(
        event.gatewayRef,
        event.reference,
        event.paidAt,
        outcome
      );

      res.status(200).json({
        success: true,
        data: { received: true, handled: result.applied, paymentId: result.paymentId },
      });
    } catch (error: any) {
      if (error instanceof PaymentGatewayError) {
        // ลายเซ็นผิด -> 400 (gateway จะ retry แต่เราไม่ควรประมวลผล)
        res.status(error.status).json({ success: false, code: error.code, error: error.message });
        return;
      }
      this.handleError(res, error, 'Error handling payment webhook');
    }
  }

  private static parseIdempotencyKey(value: unknown): string | undefined | null {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed) || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return null;
    }
    return trimmed;
  }

  private static handleError(res: Response, error: any, logMessage: string): void {
    if (error && typeof error.status === 'number' && typeof error.code === 'string') {
      res.status(error.status).json({
        success: false,
        code: error.code,
        error: error.message,
        ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
      });
      return;
    }

    console.error(`[TicketController] ${logMessage}:`, error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export default TicketController;
