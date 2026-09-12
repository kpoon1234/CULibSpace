import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { getBookingHistory, getActiveBooking } from '../services/bookingService.js';
import BookingService from '../services/bookingService.js';

export class BookingController {
  /**
   * GET /api/bookings/my-history
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
   * GET /api/bookings/my-active
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

  static async lockTable(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.uid;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { tableId, startDateTime, endDateTime } = req.body;
      const parsedTableId = parseInt(String(tableId), 10);
      if (isNaN(parsedTableId)) {
        res.status(400).json({ success: false, error: 'Valid tableId required' });
        return;
      }

      // Parse the dates so the service can check for overlaps
      const parsedStart = startDateTime ? new Date(startDateTime) : undefined;
      const parsedEnd = endDateTime ? new Date(endDateTime) : undefined;

      const lockData = await BookingService.acquireLock(
        parsedTableId,
        userId,
        parsedStart,
        parsedEnd
      );

      res.status(200).json({ success: true, data: lockData });
    } catch (err: any) {
      res.status(err.status || 500).json({ success: false, error: err.message, code: err.code });
    }
  }

  static async releaseLock(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.uid;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { tableId, lockToken } = req.body;
      const parsedTableId = parseInt(String(tableId), 10);
      if (isNaN(parsedTableId) || !lockToken) {
        res.status(400).json({ success: false, error: 'Valid tableId and lockToken are required' });
        return;
      }

      // Pass userId to the service to verify ownership
      await BookingService.releaseLock(parsedTableId, String(lockToken), userId);
      res.status(200).json({ success: true, message: 'Lock released successfully' });
    } catch (err: any) {
      res.status(err.status || 500).json({ success: false, error: err.message, code: err.code });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.uid;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { tableId, startDateTime, endDateTime, lockToken } = req.body;
      const parsedTableId = parseInt(String(tableId), 10);
      const parsedStart = new Date(startDateTime);
      const parsedEnd = new Date(endDateTime);

      if (
        isNaN(parsedTableId) ||
        isNaN(parsedStart.getTime()) ||
        isNaN(parsedEnd.getTime()) ||
        !lockToken
      ) {
        res.status(400).json({ success: false, error: 'Missing or invalid required fields' });
        return;
      }

      const booking = await BookingService.createBooking({
        userId,
        tableId: parsedTableId,
        startDateTime: parsedStart,
        endDateTime: parsedEnd,
        lockToken: String(lockToken),
      });

      res.status(201).json({ success: true, data: booking });
    } catch (err: any) {
      res.status(err.status || 500).json({ success: false, error: err.message, code: err.code });
    }
  }
}

export default BookingController;
