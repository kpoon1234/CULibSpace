import { Router } from 'express';
import { ProfileController } from '../controllers/profileController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { uploadAvatar } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.patch('/', authenticateToken, ProfileController.updateProfile);
router.patch('/image', authenticateToken, ProfileController.updateProfileImage);
router.post(
  '/upload-image',
  authenticateToken,
  uploadAvatar.single('image'),
  ProfileController.uploadProfileImage
);

export default router;
