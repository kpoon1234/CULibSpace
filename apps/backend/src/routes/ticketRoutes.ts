import { Router } from 'express';
import { TicketController } from '../controllers/ticketController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// POST /api/tickets/purchase : ซื้อตั๋วผู้เข้าชมภายนอก (เฉพาะ OUTSIDER)
// หมายเหตุ: GET /api/tickets/my-tickets และ POST /api/tickets/payment/webhook
// อยู่ในขอบเขตของ US6-2 / US6-3 (ดูรายการตั๋ว และยืนยันผลการจ่ายเงิน) ไม่ได้อยู่ใน PR นี้
router.post('/purchase', authenticateToken, requireRoles('OUTSIDER'), TicketController.purchase);
// [US6-2] GET /api/tickets/history
// ใช้ requireRoles('OUTSIDER') ตาม Requirement ที่กำหนดให้เป็นสิทธิ์ของ External Visitor
router.get('/history', authenticateToken, requireRoles('OUTSIDER'), TicketController.getHistory);
export default router;
