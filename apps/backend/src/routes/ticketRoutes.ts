import { Router } from 'express';
import { TicketController } from '../controllers/ticketController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// POST /api/tickets/purchase : ซื้อตั๋วผู้เข้าชมภายนอก (เฉพาะ OUTSIDER)
router.post('/purchase', authenticateToken, requireRoles('OUTSIDER'), TicketController.purchase);

// GET /api/tickets/my-tickets : ดูตั๋วของตัวเอง
router.get('/my-tickets', authenticateToken, TicketController.myTickets);

export default router;
