import { Router } from 'express';
import { SystemConfigController } from '../controllers/systemConfigController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// GET /api/system-config/booking-limits (Public)
router.get('/booking-limits', SystemConfigController.getBookingLimits);

// Admin Policy Configuration Endpoints (US7-4)
router.get(
  '/policy',
  authenticateToken,
  requireRoles('ADMIN'),
  SystemConfigController.getAdminPolicy
);
router.put(
  '/policy',
  authenticateToken,
  requireRoles('ADMIN'),
  SystemConfigController.updateBookingPolicy
);
router.patch(
  '/policy',
  authenticateToken,
  requireRoles('ADMIN'),
  SystemConfigController.updateBookingPolicy
);

export default router;
