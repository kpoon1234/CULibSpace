import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { AdminUserController } from '../controllers/adminUserController.js';
import { AdminAuditController } from '../controllers/adminAuditController.js';
import { IssueController } from '../controllers/issueController.js';
import { AdminScheduleController } from '../controllers/adminScheduleController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/users', authenticateToken, requireRoles('ADMIN'), AdminUserController.search);
router.get('/audit-logs', authenticateToken, requireRoles('ADMIN'), AdminAuditController.list);
router.get('/issues', authenticateToken, requireRoles('ADMIN'), IssueController.listAdmin);

// Operating Schedules (US7-4: Add and edit operating schedules with valid date/time checks)
router.get('/schedules', authenticateToken, requireRoles('ADMIN'), AdminScheduleController.list);
router.get(
  '/schedules/active',
  authenticateToken,
  requireRoles('ADMIN'),
  AdminScheduleController.getActive
);
router.get(
  '/schedules/:scheduleId',
  authenticateToken,
  requireRoles('ADMIN'),
  AdminScheduleController.getById
);
router.post('/schedules', authenticateToken, requireRoles('ADMIN'), AdminScheduleController.create);
router.put(
  '/schedules/:scheduleId',
  authenticateToken,
  requireRoles('ADMIN'),
  AdminScheduleController.update
);
router.put('/schedules', authenticateToken, requireRoles('ADMIN'), AdminScheduleController.update);
router.patch(
  '/schedules/:scheduleId',
  authenticateToken,
  requireRoles('ADMIN'),
  AdminScheduleController.update
);
router.delete(
  '/schedules/:scheduleId',
  authenticateToken,
  requireRoles('ADMIN'),
  AdminScheduleController.delete
);

// POST /api/admin/adjust-score
router.post('/adjust-score', authenticateToken, requireRoles('ADMIN'), AuthController.adjustScore);

export default router;
