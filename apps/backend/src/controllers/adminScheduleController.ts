import { Request, Response } from 'express';
import { AdminScheduleService } from '../services/adminScheduleService.js';

export class AdminScheduleController {
  /**
   * GET /api/admin/schedules
   * List operating schedules with optional query filters (q, startDate, endDate, priority, isClosed, is24Hours).
   */
  static async list(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const priority = req.query.priority !== undefined ? Number(req.query.priority) : undefined;
      const isClosed =
        req.query.isClosed !== undefined
          ? req.query.isClosed === 'true' || req.query.isClosed === '1'
          : undefined;
      const is24Hours =
        req.query.is24Hours !== undefined
          ? req.query.is24Hours === 'true' || req.query.is24Hours === '1'
          : undefined;
      const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined;

      const result = await AdminScheduleService.listSchedules(
        {
          q,
          startDate,
          endDate,
          priority,
          isClosed,
          is24Hours,
          page,
          pageSize,
        },
        prisma
      );

      res.status(200).json({
        success: true,
        data: result.schedules,
        total: result.total,
      });
    } catch (error: any) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Error listing schedules:', error);
      }
      res.status(status).json({
        success: false,
        error: error.message || 'Internal server error',
      });
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
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Error getting active schedule:', error);
      }
      res.status(status).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * GET /api/admin/schedules/:scheduleId
   * Fetch a single schedule by scheduleId.
   */
  static async getById(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
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
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Error fetching schedule by ID:', error);
      }
      res.status(status).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * POST /api/admin/schedules
   * Add a new library operating schedule with date/time checks.
   */
  static async create(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    try {
      const schedule = await AdminScheduleService.createSchedule(req.body ?? {}, prisma);
      res.status(201).json({
        success: true,
        data: schedule,
      });
    } catch (error: any) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Error creating schedule:', error);
      }
      res.status(status).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * PUT /api/admin/schedules/:scheduleId
   * PUT /api/admin/schedules
   * PATCH /api/admin/schedules/:scheduleId
   * Edit an operating schedule with valid date/time checks.
   */
  static async update(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const rawId =
      req.params.scheduleId !== undefined ? req.params.scheduleId : req.body?.scheduleId;
    const scheduleId = Number(rawId);

    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
      res.status(400).json({ success: false, error: 'scheduleId must be a positive integer' });
      return;
    }

    try {
      const schedule = await AdminScheduleService.updateSchedule(
        scheduleId,
        req.body ?? {},
        prisma
      );
      res.status(200).json({
        success: true,
        data: schedule,
      });
    } catch (error: any) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Error updating schedule:', error);
      }
      res.status(status).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * DELETE /api/admin/schedules/:scheduleId
   * Delete an operating schedule.
   */
  static async delete(req: Request, res: Response, prisma?: any): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
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
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Error deleting schedule:', error);
      }
      res.status(status).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }
}
