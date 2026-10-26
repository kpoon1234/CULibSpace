import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { SystemConfigService, DEFAULT_SYSTEM_CONFIG } from '../services/systemConfigService.js';

export class SystemConfigController {
  /**
   * GET /api/system-config/booking-limits
   * Public read-only endpoint สำหรับให้ Frontend ดึงค่าจำกัดการจองไปใช้ทำ Client-side validation
   */
  static async getBookingLimits(_req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const policy = await SystemConfigService.getPolicy();
      res.status(200).json({
        success: true,
        data: {
          maxBookingDurationMinutes: policy.maxBookingDurationMinutes,
          maxAdvanceBookingDays: policy.maxAdvanceBookingDays,
          minScoreToBook: policy.minScoreToBook,
          earlyCheckInMinutes: policy.earlyCheckInMinutes,
          lateThresholdMinutes: policy.lateThresholdMinutes,
        },
      });
    } catch {
      res.status(200).json({
        success: true,
        data: {
          maxBookingDurationMinutes: DEFAULT_SYSTEM_CONFIG.maxBookingDurationMinutes,
          maxAdvanceBookingDays: DEFAULT_SYSTEM_CONFIG.maxAdvanceBookingDays,
          minScoreToBook: DEFAULT_SYSTEM_CONFIG.minScoreToBook,
          earlyCheckInMinutes: DEFAULT_SYSTEM_CONFIG.earlyCheckInMinutes,
          lateThresholdMinutes: DEFAULT_SYSTEM_CONFIG.lateThresholdMinutes,
        },
      });
    }
  }

  /**
   * GET /api/system-config/policy (หรือ /api/admin/system-config)
   * ดึงค่าพารามิเตอร์ทั้งหมดสำหรับหน้า System Settings ของ Admin
   */
  static async getAdminPolicy(_req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = await SystemConfigService.getPolicy();
      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[SystemConfigController] Error fetching admin policy:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * PUT /api/system-config/policy (และ PATCH /api/admin/system-config)
   * บันทึกและตรวจสอบค่าพารามิเตอร์นโยบายการจอง (US7-4: Andy & Punt)
   */
  static async updateBookingPolicy(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const authReq = req as AuthenticatedRequest;
    const adminId = authReq.user?.adminId;

    if (!adminId || authReq.user?.role !== 'ADMIN') {
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Unauthorized: Admin session required',
      });
      return;
    }

    try {
      const updated = await SystemConfigService.updatePolicy(adminId, req.body);
      res.status(200).json({
        success: true,
        message: 'Booking policy limits updated successfully',
        data: updated,
      });
    } catch (error: any) {
      if (error && typeof error.status === 'number') {
        res.status(error.status).json({
          success: false,
          code: error.code,
          error: error.message,
          ...(error.errors ? { errors: error.errors } : {}),
        });
        return;
      }
      console.error('[SystemConfigController] Error updating booking policy:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
