import { Router, raw } from 'express';
import { TicketController } from '../controllers/ticketController.js';

const router = Router();

/**
 * [US6-1] Webhook router ของ Payment Gateway
 * -------------------------------------------------------------------------
 * ต้องใช้ "raw body" เพื่อตรวจสอบลายเซ็นของ Stripe อย่างถูกต้อง
 * (Stripe คำนวณ signature จาก byte ดิบของ body)
 *
 * router นี้ต้องถูก mount ก่อน express.json() ใน server.ts
 * มิฉะนั้น body จะถูก parse เป็น object ไปแล้วและ verify signature ไม่ผ่าน
 */
router.post('/', raw({ type: 'application/json' }), TicketController.paymentWebhook);

export default router;
