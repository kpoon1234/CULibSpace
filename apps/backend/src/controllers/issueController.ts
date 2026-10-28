import { IssueStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { IssueService, IssueStatusLabel } from '../services/issueService.js';

const MAX_PRISMA_INT = 2_147_483_647;
const MAX_ISSUE_INFORMATION_LENGTH = 2000;
const MAX_ISSUE_NOTES_LENGTH = 2000;
const STATUS_BY_LABEL: Record<IssueStatusLabel, IssueStatus> = {
  Pending: IssueStatus.PENDING,
  'In Progress': IssueStatus.IN_PROGRESS,
  Completed: IssueStatus.COMPLETED,
};

function parsePositiveInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

export class IssueController {
  static async updateAdmin(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Admin session required' });
      return;
    }
    const adminId = user.adminId;
    if (
      user.role !== 'ADMIN' ||
      typeof adminId !== 'number' ||
      !Number.isSafeInteger(adminId) ||
      adminId < 1 ||
      adminId > MAX_PRISMA_INT
    ) {
      res.status(403).json({ success: false, error: 'Valid admin session required' });
      return;
    }

    const issueId = parsePositiveInteger(req.params.issueId, 0);
    if (issueId === null || issueId < 1 || issueId > MAX_PRISMA_INT) {
      res.status(400).json({ success: false, error: 'issueId must be a positive integer' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ success: false, error: 'An issue update object is required' });
      return;
    }
    if (Object.keys(body).some((key) => !['status', 'notes', 'blocksTable'].includes(key))) {
      res
        .status(400)
        .json({ success: false, error: 'Only status, notes, and blocksTable can be updated' });
      return;
    }
    const { status, notes, blocksTable } = body;
    if (typeof status !== 'string' || !Object.hasOwn(STATUS_BY_LABEL, status)) {
      res
        .status(400)
        .json({ success: false, error: 'status must be Pending, In Progress, or Completed' });
      return;
    }
    if (typeof blocksTable !== 'boolean') {
      res.status(400).json({ success: false, error: 'blocksTable must be an explicit boolean' });
      return;
    }
    if (typeof notes !== 'string' || notes.trim().length > MAX_ISSUE_NOTES_LENGTH) {
      res.status(400).json({
        success: false,
        error: `notes must be a string of at most ${MAX_ISSUE_NOTES_LENGTH} characters`,
      });
      return;
    }

    try {
      const data = await IssueService.updateAdmin({
        adminId,
        issueId,
        status: STATUS_BY_LABEL[status as IssueStatusLabel],
        blocksTable,
        notes: notes.trim(),
      });
      res.status(200).json({ success: true, message: 'Issue report updated successfully', data });
    } catch (error: any) {
      if (error?.code === 'ADMIN_NOT_FOUND' || error?.code === 'ISSUE_NOT_FOUND') {
        res.status(error.status).json({ success: false, code: error.code, error: error.message });
        return;
      }
      console.error('Error updating admin issue report:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const uid = (req as AuthenticatedRequest).user?.uid;
    if (!uid) {
      res.status(401).json({ success: false, error: 'User session required' });
      return;
    }

    const { tableId, issueInformation } = req.body ?? {};
    if (
      typeof tableId !== 'number' ||
      !Number.isSafeInteger(tableId) ||
      tableId < 1 ||
      tableId > MAX_PRISMA_INT
    ) {
      res.status(400).json({ success: false, error: 'tableId must be a positive integer' });
      return;
    }
    if (typeof issueInformation !== 'string' || issueInformation.trim().length === 0) {
      res.status(400).json({ success: false, error: 'issueInformation is required' });
      return;
    }

    const normalizedInformation = issueInformation.trim();
    if (normalizedInformation.length > MAX_ISSUE_INFORMATION_LENGTH) {
      res.status(400).json({
        success: false,
        error: `issueInformation must be at most ${MAX_ISSUE_INFORMATION_LENGTH} characters`,
      });
      return;
    }

    try {
      const data = await IssueService.create({
        uid,
        tableId,
        issueInformation: normalizedInformation,
      });
      res.status(201).json({
        success: true,
        message: 'Issue report submitted successfully',
        data,
      });
    } catch (error: any) {
      if (error?.code === 'USER_NOT_FOUND' || error?.code === 'PROFILE_INCOMPLETE') {
        res.status(error.status).json({
          success: false,
          code: error.code,
          error: error.message,
        });
        return;
      }
      if (error?.code === 'P2003') {
        const fieldName = error.meta?.constraint ?? error.meta?.field_name;
        const constraint =
          typeof fieldName === 'string' ? fieldName.replace(/ \(index\)$/, '') : '';
        if (constraint === 'issue_report_uid_fkey' || constraint === 'uid') {
          res.status(401).json({
            success: false,
            code: 'USER_NOT_FOUND',
            error: 'User session is no longer valid',
          });
          return;
        }
        const isTableReference =
          constraint === 'issue_report_tableid_fkey' ||
          constraint === 'tableid' ||
          constraint === 'tableId';
        res.status(400).json({
          success: false,
          error: isTableReference
            ? 'The selected table does not exist'
            : 'Invalid table or user reference',
        });
        return;
      }
      console.error('Error creating issue report:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async listAdmin(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const rawQ = req.query.q;
    const rawStatus = req.query.status;
    const page = parsePositiveInteger(req.query.page, 1);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20);

    if (rawQ !== undefined && typeof rawQ !== 'string') {
      res.status(400).json({ success: false, error: 'q must be a string' });
      return;
    }
    if (
      rawStatus !== undefined &&
      (typeof rawStatus !== 'string' || !Object.hasOwn(STATUS_BY_LABEL, rawStatus))
    ) {
      res.status(400).json({
        success: false,
        error: 'status must be Pending, In Progress, or Completed',
      });
      return;
    }
    if (
      page === null ||
      pageSize === null ||
      pageSize > 100 ||
      (page - 1) * pageSize > MAX_PRISMA_INT
    ) {
      res.status(400).json({
        success: false,
        error: 'page must be a positive integer and pageSize must be between 1 and 100',
      });
      return;
    }

    try {
      const data = await IssueService.listAdmin({
        q: (rawQ ?? '').trim(),
        status: rawStatus ? STATUS_BY_LABEL[rawStatus as IssueStatusLabel] : undefined,
        page,
        pageSize,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Error listing admin issue reports:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
