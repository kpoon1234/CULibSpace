import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { AdminUserController } from '../controllers/adminUserController.js';
import { AdminAuditController } from '../controllers/adminAuditController.js';
import { IssueController } from '../controllers/issueController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/users', authenticateToken, requireRoles('ADMIN'), AdminUserController.search);
router.get('/audit-logs', authenticateToken, requireRoles('ADMIN'), AdminAuditController.list);
router.get('/issues', authenticateToken, requireRoles('ADMIN'), IssueController.listAdmin);
router.patch(
  '/issues/:issueId',
  authenticateToken,
  requireRoles('ADMIN'),
  IssueController.updateAdmin
);

// POST /api/admin/adjust-score
router.post('/adjust-score', authenticateToken, requireRoles('ADMIN'), AuthController.adjustScore);

export default router;
