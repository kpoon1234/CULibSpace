import { Request, Response } from 'express';
import { LayoutService } from '../services/layoutService.js';

export class LayoutController {
  static async getFloorPlan(req: Request, res: Response): Promise<void> {
    try {
      const { zoneType, plugCap, hasTvScreen, minSeats } = req.query;

      const filters = {
        zoneType: zoneType ? String(zoneType).toUpperCase() : undefined,
        plugCap: plugCap ? parseInt(String(plugCap), 10) : undefined,
        minSeats: minSeats ? parseInt(String(minSeats), 10) : undefined,
        hasTvScreen: hasTvScreen === 'true' ? true : hasTvScreen === 'false' ? false : undefined,
      };

      const layout = await LayoutService.getFloorLayout(filters);

      res.status(200).json({
        success: true,
        data: layout,
      });
    } catch (err: any) {
      console.error('[LayoutController] Error fetching floor plan:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Internal server error fetching layout',
      });
    }
  }
}
