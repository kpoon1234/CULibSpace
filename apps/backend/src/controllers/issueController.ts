import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { IssueService } from '../services/issueService.js';

const MAX_PRISMA_INT = 2_147_483_647;
const MAX_ISSUE_INFORMATION_LENGTH = 2000;
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
}
