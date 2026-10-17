import { Request, Response } from 'express';
import { UserType } from '@prisma/client';
import { AdminUserService } from '../services/adminUserService.js';

const MAX_PRISMA_INT = 2_147_483_647;

function parsePositiveInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

export class AdminUserController {
  static async search(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const rawQ = req.query.q;
    const rawUserType = req.query.userType;
    const page = parsePositiveInteger(req.query.page, 1);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20);

    if (rawQ !== undefined && typeof rawQ !== 'string') {
      res.status(400).json({ success: false, error: 'q must be a string' });
      return;
    }
    if (
      rawUserType !== undefined &&
      rawUserType !== UserType.UNIVERSITY &&
      rawUserType !== UserType.THAI &&
      rawUserType !== UserType.FOREIGN
    ) {
      res.status(400).json({ success: false, error: 'Invalid userType' });
      return;
    }
    if (page === null || (pageSize !== null && (page - 1) * pageSize > MAX_PRISMA_INT)) {
      res.status(400).json({ success: false, error: 'page must be a positive integer' });
      return;
    }
    if (pageSize === null || pageSize > 100) {
      res.status(400).json({ success: false, error: 'pageSize must be between 1 and 100' });
      return;
    }

    try {
      const data = await AdminUserService.search({
        q: (rawQ ?? '').trim(),
        userType: rawUserType as UserType | undefined,
        page,
        pageSize,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Error searching admin users:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
