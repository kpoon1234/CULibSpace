import { Router } from 'express';
import { BookingController } from '../controllers/bookingController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/history', authenticateToken, BookingController.getBookingHistory);
router.get('/active', authenticateToken, BookingController.getActiveBooking);

export default router;
