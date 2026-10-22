import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { TicketService, MAX_CLIENT_KEY_LENGTH } from '../services/ticketService.js';
import { getPaymentGateway } from '../services/paymentGatewayFactory.js';

/**
 * [US6-1] Visitor Ticket Controller
 *
 * หมายเหตุเรื่อง `this`:
 *   method เหล่านี้ถูกส่งตรง ๆ ให้ Express เป็น handler (`router.post('/purchase', ..., TicketController.purchase)`)
 *   Express จะเรียกมันโดยไม่ผูก `this` กับคลาส -> ถ้าเรียก `this.someHelper()` จะพัง
 *   ทุก helper จึงถูกทำเป็นฟังก์ชันระดับโมดูล (ไม่ใช่ static method) เพื่อไม่ต้องพึ่ง `this` เลย
 */

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

interface ParsedIdempotencyKey {
  value?: string;
  error?: string;
}

/**
 * ตรวจรูปแบบ idempotency key ที่ client ส่งมา
 * @returns { value } เมื่อถูกต้อง, { error } เมื่อผิด
 */
function parseIdempotencyKey(raw: unknown): ParsedIdempotencyKey {
  if (raw === undefined || raw === null || raw === '') {
    return { value: undefined };
  }

  if (typeof raw !== 'string') {
    return { error: 'idempotencyKey must be a string' };
  }

  const trimmed = raw.trim();
  if (trimmed.length > MAX_CLIENT_KEY_LENGTH) {
    return {
      error: `idempotencyKey must be at most ${MAX_CLIENT_KEY_LENGTH} characters`,
    };
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    return {
      error: `idempotencyKey may only contain letters, numbers, and the characters . _ : -`,
    };
  }

  return { value: trimmed };
}

/**
 * แปลง error จาก service เป็น HTTP response
 */
function handleError(res: Response, error: any, logMessage: string): void {
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
      const idempotencyKey = parseIdempotencyKey(body.idempotencyKey);

      if (idempotencyKey.error) {
        res.status(400).json({
          success: false,
          code: 'INVALID_IDEMPOTENCY_KEY',
          error: idempotencyKey.error,
        });
        return;
      }

      const gateway = getPaymentGateway();

      const result = await TicketService.purchase(
        { uid, idempotencyKey: idempotencyKey.value },
        gateway
      );

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
      handleError(res, error, 'Error purchasing ticket');
    }
  }
}

export default TicketController;
