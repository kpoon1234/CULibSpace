import { Router } from 'express';
import { BookingController } from '../controllers/bookingController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/my-history', authenticateToken, BookingController.getBookingHistory);
router.get('/my-active', authenticateToken, BookingController.getActiveBooking);

// POST /api/bookings/lock
// Acquires a 5-minute temporary hold on a table
router.post('/lock', authenticateToken, BookingController.lockTable);

// POST /api/bookings/unlock
router.post('/unlock', authenticateToken, BookingController.releaseLock);

// POST /api/bookings
// Submits and finalizes a booking reservation
router.post('/', authenticateToken, BookingController.create);

export default router;
