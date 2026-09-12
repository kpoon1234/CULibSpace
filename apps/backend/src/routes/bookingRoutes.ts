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

// POST /api/bookings
// Same rules as /validate, but persists the Booking row once they all pass.
router.post(
  '/',
  (req, res, next) => {
    if (req.headers.authorization) {
      return authenticateToken(req, res, next);
    }
    next();
  },
  BookingController.create
);

export default router;
