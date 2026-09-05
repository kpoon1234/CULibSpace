import { Router } from 'express';
import passport from '../passport.js';
import { AuthController } from '../controllers/authController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// ==========================================
// 1. Google OAuth & Session Routes (/auth/*)
// ==========================================
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (err: any, user: any, info: any) => {
    console.log('[google/callback] err=', err, 'user=', user, 'info=', info);
    if (err || !user) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/login`);
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.log('[google/callback] req.logIn error=', loginErr);
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/login`);
      }
      return AuthController.googleCallback(req, res);
    });
  })(req, res, next);
});

router.post('/logout', AuthController.logout);
router.get('/session/me', AuthController.getSessionMe);

// Hybrid /me endpoint: checks Authorization Bearer token first, falls back to session
router.get('/me', (req, res, next) => {
  if (req.headers.authorization) {
    return authenticateToken(req, res, () => AuthController.getMe(req, res));
  }
  return AuthController.getSessionMe(req, res);
});

// Behavior score & history log (US1-5 / FR-1.5)
router.get('/score', authenticateToken, AuthController.getScore);
router.get('/me/score', authenticateToken, AuthController.getScore);
router.get('/user/score', authenticateToken, AuthController.getScore);

// ==========================================
// 2. Direct / Mock JWT Authentication
// ==========================================
router.post('/login', AuthController.login);
router.post('/google', AuthController.login);
router.post('/admin-login', AuthController.adminLogin);
router.post('/complete-profile', authenticateToken, AuthController.completeProfile);
router.patch('/profile', authenticateToken, AuthController.updateProfile);

// ==========================================
// 3. Example Protected Endpoints (RBAC)
// ==========================================
router.get('/protected/profile', authenticateToken, AuthController.getProfile);
router.get(
  '/protected/student-only',
  authenticateToken,
  requireRoles('STUDENT'),
  AuthController.getStudentArea
);
router.get(
  '/protected/admin-only',
  authenticateToken,
  requireRoles('ADMIN'),
  AuthController.getAdminArea
);

export default router;
