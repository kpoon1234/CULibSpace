import { Router } from 'express';
import { TicketController } from '../controllers/ticketController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// POST /api/tickets/purchase : ซื้อตั๋วผู้เข้าชมภายนอก (เฉพาะ OUTSIDER)
// US6-2 owns ticket retrieval. US6-3's webhook is mounted separately before
// express.json() in server.ts; do not duplicate it behind this JSON-parsed router.
router.post('/purchase', authenticateToken, requireRoles('OUTSIDER'), TicketController.purchase);

export default router;
