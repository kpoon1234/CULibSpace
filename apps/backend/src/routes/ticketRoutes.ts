import { Router } from 'express';
import { TicketController } from '../controllers/ticketController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

// US6-2: Endpoint สำหรับดูประวัติตั๋วและสถานะการจ่ายเงิน
// GET /api/tickets/history
router.get('/history', authenticateToken, TicketController.getHistory);

export default router;
