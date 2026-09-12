import { Request, Response } from 'express';
import { BookingService } from '../services/bookingService.js';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';

export class BookingController {
  /**
   * POST /api/bookings/validate
   * Pre-validates booking parameters against all US3-1 library rules:
   * 1. Operating schedule & max duration
   * 2. User behavior credit score (>= minScoreToBook)
   * 3. 1-Booking-per-user policy (no overlapping active bookings)
   * 4. Table availability, maintenance status, and hold-lock
   * 5. Outside visitor active paid ticket check
   */
  static async validate(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      // Extract userId from authenticated session or allow body.userId if provided
      const userId =
        authReq.user?.uid ?? (req.body.userId ? parseInt(String(req.body.userId), 10) : undefined);

      if (!userId || isNaN(userId)) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Valid user session or userId is required',
        });
        return;
      }

      const { tableId, startDateTime, endDateTime, lockToken } = req.body;

      if (!tableId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: tableId',
        });
        return;
      }

      if (!startDateTime || !endDateTime) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: startDateTime and endDateTime',
        });
        return;
      }

      const parsedTableId = parseInt(String(tableId), 10);
      const parsedStart = new Date(startDateTime);
      const parsedEnd = new Date(endDateTime);

      if (isNaN(parsedTableId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid tableId: must be a valid integer',
        });
        return;
      }

      if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid startDateTime or endDateTime format',
        });
        return;
      }

      const result = await BookingService.validateBookingRules({
        userId,
        tableId: parsedTableId,
        startDateTime: parsedStart,
        endDateTime: parsedEnd,
        lockToken: lockToken ? String(lockToken) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to validate booking rules',
        code: err.code,
      });
    }
  }

  /**
   * POST /api/bookings
   * Same request shape and rules as /validate, but persists the Booking row
   * (status PENDING) once every rule passes.
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId =
        authReq.user?.uid ?? (req.body.userId ? parseInt(String(req.body.userId), 10) : undefined);

      if (!userId || isNaN(userId)) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Valid user session or userId is required',
        });
        return;
      }

      const { tableId, startDateTime, endDateTime, lockToken } = req.body;

      if (!tableId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: tableId',
        });
        return;
      }

      if (!startDateTime || !endDateTime) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: startDateTime and endDateTime',
        });
        return;
      }

      const parsedTableId = parseInt(String(tableId), 10);
      const parsedStart = new Date(startDateTime);
      const parsedEnd = new Date(endDateTime);

      if (isNaN(parsedTableId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid tableId: must be a valid integer',
        });
        return;
      }

      if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid startDateTime or endDateTime format',
        });
        return;
      }

      const result = await BookingService.createBooking({
        userId,
        tableId: parsedTableId,
        startDateTime: parsedStart,
        endDateTime: parsedEnd,
        lockToken: lockToken ? String(lockToken) : undefined,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to create booking',
        code: err.code,
      });
    }
  }
}
