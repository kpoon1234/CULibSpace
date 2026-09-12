import { Router } from 'express';
import { BookingController } from '../controllers/bookingController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/my-history', authenticateToken, BookingController.getBookingHistory);
router.get('/my-active', authenticateToken, BookingController.getActiveBooking);

export default router;
