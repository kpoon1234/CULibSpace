import { Request, Response } from 'express';
import { TicketService } from '../services/ticketService.js';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';

export class TicketController {
  /**
   * US6-2: Get ticket and payment history for the logged-in user
   */
  static async getHistory(req: Request, res: Response) {
    try {
      // Type Cast เพื่อดึง user จาก Middleware ตามมาตรฐานของโปรเจกต์
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.uid;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      // เรียกใช้งาน Service โดยส่งแค่ userId เพื่อดูเฉพาะตั๋วของตัวเอง (Ownership validation)
      const ticketHistory = await TicketService.getTicketHistory(userId);

      return res.status(200).json({
        success: true,
        message: 'Ticket history retrieved successfully',
        data: ticketHistory,
      });
    } catch (error: any) {
      console.error('[TicketController] Error fetching ticket history:', error);

      const status = error.status || 500;
      const code = error.code || 'INTERNAL_SERVER_ERROR';
      const message = error.message || 'An unexpected error occurred while retrieving tickets';

      return res.status(status).json({ success: false, code, error: message });
    }
  }
}
