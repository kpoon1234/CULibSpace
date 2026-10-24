import { Router } from 'express';
import { IssueController } from '../controllers/issueController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

router.post(
  '/',
  authenticateToken,
  requireRoles('STUDENT', 'STAFF', 'OUTSIDER'),
  IssueController.create
);

export default router;
