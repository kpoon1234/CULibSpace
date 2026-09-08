import { Router } from 'express';
import { LayoutController } from '../controllers/layoutController.js';

const router = Router();

// GET /api/layout
// We use /layout instead of /seats to respect the actual data structure
router.get('/', LayoutController.getFloorPlan);

export default router;
