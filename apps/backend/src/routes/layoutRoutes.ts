import { Router } from 'express';
import { LayoutController } from '../controllers/layoutController.js';

const router = Router();

// GET /api/tables/layout
// รองรับพารามิเตอร์แบบ Static (US2-1) และแบบมี Time Parameters (US2-2, US2-4)
router.get('/', LayoutController.getLayout);

export default router;
