import { Router } from 'express';
import { TicketController } from '../controllers/ticketController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// POST /api/tickets/purchase : ซื้อตั๋วผู้เข้าชมภายนอก (เฉพาะ OUTSIDER)
// GET /api/tickets/my-tickets และ GET /api/tickets/:ticketId : ดูตั๋วและประวัติชำระเงิน (US6-2)
// US6-3's webhook is mounted separately before express.json() in server.ts;
// do not duplicate it behind this JSON-parsed router.
router.post('/purchase', authenticateToken, requireRoles('OUTSIDER'), TicketController.purchase);
router.get(
  '/my-tickets',
  authenticateToken,
  requireRoles('OUTSIDER'),
  TicketController.getMyTickets
);
router.get('/:ticketId', authenticateToken, TicketController.getTicketById);
export default router;
