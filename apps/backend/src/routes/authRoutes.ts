import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

// US1-1: Role Mapping & Session/JWT Management
router.post('/login', AuthController.login);
router.post('/google', AuthController.login); // Alias for Google OAuth exchange
router.get('/me', authenticateToken, AuthController.getMe);

export default router;
