import { Router } from 'express';
import { BookingController } from '../controllers/bookingController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

// POST /api/bookings/validate
// Pre-validate all booking rules (hours, duration, score, overlap, table status, outside ticket)
// Accepts Bearer token authentication or fallback userId in body for development
router.post(
  '/validate',
  (req, res, next) => {
    if (req.headers.authorization) {
      return authenticateToken(req, res, next);
    }
    next();
  },
  BookingController.validate
);

export default router;
