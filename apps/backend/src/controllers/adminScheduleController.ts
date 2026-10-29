import { Request, Response } from 'express';
import { AdminScheduleService } from '../services/adminScheduleService.js';

function sendError(res: Response, error: any, logLabel: string): void {
  const status = typeof error?.status === 'number' ? error.status : 500;
  if (status >= 500) {
    console.error(`${logLabel}:`, error);
  }
  res.status(status).json({
    success: false,
    ...(status < 500 && error?.code ? { code: error.code } : {}),
    error: status < 500 && error?.message ? error.message : 'Internal server error',
  });
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Query booleans must be exactly "true"/"false" (or "1"/"0"); anything else is a 400. */
function queryBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw { status: 400, code: 'INVALID_SCHEDULE_INPUT', message: `${field} must be true or false` };
}

function parseScheduleId(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 1 ? raw : null;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

export class AdminScheduleController {
  /**
   * GET /api/admin/schedules
   * List operating schedules with optional query filters (q, startDate, endDate, priority, isClosed, is24Hours, page, pageSize).
   */
  static async list(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    try {
      const result = await AdminScheduleService.listSchedules(
        {
          q: queryString(req.query.q),
          startDate: queryString(req.query.startDate),
          endDate: queryString(req.query.endDate),
          priority: queryString(req.query.priority),
          isClosed: queryBoolean(req.query.isClosed, 'isClosed'),
          is24Hours: queryBoolean(req.query.is24Hours, 'is24Hours'),
          page: queryString(req.query.page),
          pageSize: queryString(req.query.pageSize),
        },
        prisma
      );

      res.status(200).json({
        success: true,
        data: result.schedules,
        total: result.total,
      });
    } catch (error: any) {
      sendError(res, error, 'Error listing schedules');
    }
  }

  /**
   * GET /api/admin/schedules/active
   * Get the active operating schedule for a given date (or today in Asia/Bangkok if omitted) according to priority.
   */
  static async getActive(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    try {
      const dateParam =
        typeof req.query.date === 'string' && req.query.date.trim().length > 0
          ? req.query.date.trim()
          : AdminScheduleService.getTodayDateStringBangkok();
      const schedule = await AdminScheduleService.getActiveScheduleOnDate(dateParam, prisma);

      res.status(200).json({
        success: true,
        data: schedule,
      });
    } catch (error: any) {
      sendError(res, error, 'Error getting active schedule');
    }
  }

  /**
   * GET /api/admin/schedules/:scheduleId
   * Fetch a single schedule by scheduleId.
   */
  static async getById(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const scheduleId = parseScheduleId(req.params.scheduleId);
    if (scheduleId === null) {
      res.status(400).json({ success: false, error: 'scheduleId must be a positive integer' });
      return;
    }

    try {
      const schedule = await AdminScheduleService.getScheduleById(scheduleId, prisma);
      res.status(200).json({
        success: true,
        data: schedule,
      });
    } catch (error: any) {
      sendError(res, error, 'Error fetching schedule by ID');
    }
  }

  /**
   * POST /api/admin/schedules
   * Add a new library operating schedule with date/time checks.
   */
  static async create(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    try {
      const schedule = await AdminScheduleService.createSchedule(req.body, prisma);
      res.status(201).json({
        success: true,
        data: schedule,
      });
    } catch (error: any) {
      sendError(res, error, 'Error creating schedule');
    }
  }

  /**
   * PUT /api/admin/schedules/:scheduleId
   * PUT /api/admin/schedules
   * PATCH /api/admin/schedules/:scheduleId
   * Edit an operating schedule with valid date/time checks (only the provided fields are written).
   */
  static async update(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const rawId =
      req.params.scheduleId !== undefined ? req.params.scheduleId : req.body?.scheduleId;
    const scheduleId = parseScheduleId(rawId);

    if (scheduleId === null) {
      res.status(400).json({ success: false, error: 'scheduleId must be a positive integer' });
      return;
    }

    try {
      const schedule = await AdminScheduleService.updateSchedule(scheduleId, req.body, prisma);
      res.status(200).json({
        success: true,
        data: schedule,
      });
    } catch (error: any) {
      sendError(res, error, 'Error updating schedule');
    }
  }

  /**
   * DELETE /api/admin/schedules/:scheduleId
   * Delete an operating schedule.
   */
  static async delete(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const scheduleId = parseScheduleId(req.params.scheduleId);
    if (scheduleId === null) {
      res.status(400).json({ success: false, error: 'scheduleId must be a positive integer' });
      return;
    }

    try {
      await AdminScheduleService.deleteSchedule(scheduleId, prisma);
      res.status(200).json({
        success: true,
        message: 'Operating schedule deleted successfully',
      });
    } catch (error: any) {
      sendError(res, error, 'Error deleting schedule');
    }
  }
}
