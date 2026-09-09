import { Router } from 'express';
import { ProfileController } from '../controllers/profileController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

router.patch('/', authenticateToken, ProfileController.updateProfile);
router.patch('/image', authenticateToken, ProfileController.updateProfileImage);

export default router;
