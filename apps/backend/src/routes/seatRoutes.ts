import { Router } from 'express';
import { SeatController } from '../controllers/seatController.js';

const router = Router();

// GET /api/seats/layout - ดึงผังโซนและโต๊ะพร้อมสถานะแบบเรียลไทม์
router.get('/layout', SeatController.getLayout);

export default router;
