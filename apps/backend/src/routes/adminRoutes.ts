import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { AdminUserController } from '../controllers/adminUserController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/users', authenticateToken, requireRoles('ADMIN'), AdminUserController.search);

// POST /api/admin/adjust-score
router.post('/adjust-score', authenticateToken, requireRoles('ADMIN'), AuthController.adjustScore);

export default router;
