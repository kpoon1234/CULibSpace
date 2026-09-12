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

// POST /api/bookings/lock
// Acquires a 5-minute temporary hold on a table
router.post('/lock', authenticateToken, BookingController.lockTable);

// POST /api/bookings/unlock
router.post('/unlock', authenticateToken, BookingController.releaseLock);

// POST /api/bookings
// Submits and finalizes a booking reservation
router.post('/', authenticateToken, BookingController.create);

export default router;
