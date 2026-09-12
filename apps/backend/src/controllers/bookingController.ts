import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { getBookingHistory, getActiveBooking } from '../services/bookingService.js';

export class BookingController {
  /**
   * GET /api/bookings/history
   * Fetch booking history for the logged-in user
   */
  static async getBookingHistory(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const uid = authReq.user?.uid;

      if (!uid) {
        res.status(401).json({ success: false, error: 'Unauthorized: User session required' });
        return;
      }

      const history = await getBookingHistory(uid);
      res.status(200).json({ success: true, data: history });
    } catch (err: any) {
      console.error('Error fetching booking history:', err);
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  /**
   * GET /api/bookings/active
   * Fetch current active booking for the logged-in user
   */
  static async getActiveBooking(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const uid = authReq.user?.uid;

      if (!uid) {
        res.status(401).json({ success: false, error: 'Unauthorized: User session required' });
        return;
      }

      const activeBooking = await getActiveBooking(uid);
      res.status(200).json({ success: true, data: activeBooking }); // data can be null
    } catch (err: any) {
      console.error('Error fetching active booking:', err);
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}

export default BookingController;
