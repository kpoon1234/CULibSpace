import { Router } from 'express';
import { SystemConfigController } from '../controllers/systemConfigController.js';

const router = Router();

// GET /api/system-config/booking-limits
router.get('/booking-limits', SystemConfigController.getBookingLimits);

export default router;
