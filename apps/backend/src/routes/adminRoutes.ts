import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// POST /api/admin/adjust-score
router.post('/adjust-score', authenticateToken, requireRoles('ADMIN'), AuthController.adjustScore);

export default router;
