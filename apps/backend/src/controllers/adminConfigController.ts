import { Request, Response } from 'express';
import { AdminConfigService } from '../services/adminConfigService.js';

export class AdminConfigController {
  /**
   * GET /api/admin/config
   * Get all booking policy parameters and system configuration.
   */
  static async getConfig(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    try {
      const config = await AdminConfigService.getConfig();
      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error: any) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Error getting system config:', error);
      }
      res.status(status).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * PUT /api/admin/config
   * PATCH /api/admin/config
   * Update booking policy parameters and reservation limits.
   */
  static async updateConfig(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    try {
      const updated = await AdminConfigService.updateConfig(req.body ?? {});
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error: any) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Error updating system config:', error);
      }
      res.status(status).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }
}
