import { Request, Response } from 'express';
import { AdminAuditService, AuditDirection } from '../services/adminAuditService.js';

const MAX_PRISMA_INT = 2_147_483_647;
const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parsePositiveInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function parseIsoDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATETIME.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const isLeapYear = numericYear % 4 === 0 && (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    numericMonth - 1
  ];
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > daysInMonth ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class AdminAuditController {
  static async list(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const rawQ = req.query.q;
    const rawDirection = req.query.direction;
    const rawFrom = req.query.from;
    const rawTo = req.query.to;
    const page = parsePositiveInteger(req.query.page, 1);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20);

    if (rawQ !== undefined && typeof rawQ !== 'string') {
      res.status(400).json({ success: false, error: 'q must be a string' });
      return;
    }
    if (rawDirection !== undefined && rawDirection !== 'deduct' && rawDirection !== 'add') {
      res.status(400).json({ success: false, error: 'Invalid direction' });
      return;
    }

    const from = rawFrom === undefined ? undefined : parseIsoDateTime(rawFrom);
    const to = rawTo === undefined ? undefined : parseIsoDateTime(rawTo);
    if (from === null || to === null || (from && to && from > to)) {
      res.status(400).json({ success: false, error: 'Invalid date range' });
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
      const data = await AdminAuditService.list({
        q: (rawQ ?? '').trim(),
        direction: rawDirection as AuditDirection | undefined,
        from,
        to,
        page,
        pageSize,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Error listing admin audit logs:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
