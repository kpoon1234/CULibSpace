import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { AuthController } from '../controllers/authController.js';
import { AdminUserController } from '../controllers/adminUserController.js';
import { AdminAuditController } from '../controllers/adminAuditController.js';
import { IssueController } from '../controllers/issueController.js';
import {
  AdminScheduleController,
  createAdminScheduleController,
} from '../controllers/adminScheduleController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

export function createAdminRouter(prisma?: PrismaClient): Router {
  const router = Router();
  const scheduleController = prisma
    ? createAdminScheduleController(prisma)
    : AdminScheduleController;

  router.get('/users', authenticateToken, requireRoles('ADMIN'), AdminUserController.search);
  router.get('/audit-logs', authenticateToken, requireRoles('ADMIN'), AdminAuditController.list);
  router.get('/issues', authenticateToken, requireRoles('ADMIN'), IssueController.listAdmin);
  router.patch(
    '/issues/:issueId',
    authenticateToken,
    requireRoles('ADMIN'),
    IssueController.updateAdmin
  );

  // Operating Schedules (US7-4: Add and edit operating schedules with valid date/time checks)
  router.get('/schedules', authenticateToken, requireRoles('ADMIN'), scheduleController.list);
  router.get(
    '/schedules/active',
    authenticateToken,
    requireRoles('ADMIN'),
    scheduleController.getActive
  );
  router.get(
    '/schedules/:scheduleId',
    authenticateToken,
    requireRoles('ADMIN'),
    scheduleController.getById
  );
  router.post('/schedules', authenticateToken, requireRoles('ADMIN'), scheduleController.create);
  router.put(
    '/schedules/:scheduleId',
    authenticateToken,
    requireRoles('ADMIN'),
    scheduleController.update
  );
  router.put('/schedules', authenticateToken, requireRoles('ADMIN'), scheduleController.update);
  router.patch(
    '/schedules/:scheduleId',
    authenticateToken,
    requireRoles('ADMIN'),
    scheduleController.update
  );
  router.delete(
    '/schedules/:scheduleId',
    authenticateToken,
    requireRoles('ADMIN'),
    scheduleController.delete
  );

  // POST /api/admin/adjust-score
  router.post(
    '/adjust-score',
    authenticateToken,
    requireRoles('ADMIN'),
    AuthController.adjustScore
  );

  return router;
}

const router = createAdminRouter();

export default router;
