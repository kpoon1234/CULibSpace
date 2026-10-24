import { IssueStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { IssueService, IssueStatusLabel } from '../services/issueService.js';

const MAX_PRISMA_INT = 2_147_483_647;
const MAX_ISSUE_INFORMATION_LENGTH = 2000;
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
      if (error?.code === 'P2003') {
        res.status(400).json({ success: false, error: 'The selected table does not exist' });
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
