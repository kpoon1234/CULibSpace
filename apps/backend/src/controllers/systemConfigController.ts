import type { Request, Response, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { SystemConfigService } from '../services/systemConfigService.js';
import {
  BOOKING_POLICY_FIELDS,
  readBookingPolicy,
  type PolicyClient,
} from '../services/bookingPolicyService.js';

const prisma = new PrismaClient();

/** Public, read-only saved limits. Dependency injection never occupies Express's next argument. */
export function createBookingLimitsHandler(client: PolicyClient): RequestHandler {
  return async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const policy = await readBookingPolicy(client, BOOKING_POLICY_FIELDS);
      res.status(200).json({ success: true, data: policy });
    } catch (error) {
      const failure = error as { status?: number; code?: string; message?: string };
      res.status(failure.status ?? 500).json({
        success: false,
        code: failure.code ?? 'BOOKING_SETTINGS_UNAVAILABLE',
        error: failure.status ? failure.message : 'Booking settings are temporarily unavailable.',
      });
    }
  };
}

export class SystemConfigController {
  /**
   * GET /api/system-config/booking-limits
   * Public read-only endpoint สำหรับให้ Frontend ดึงค่าจำกัดการจองไปใช้ทำ Client-side validation
   */
  static getBookingLimits = createBookingLimitsHandler(prisma);

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
   * บันทึกและตรวจสอบค่าพารามิเตอร์นโยบายการจอง (US7-4)
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
