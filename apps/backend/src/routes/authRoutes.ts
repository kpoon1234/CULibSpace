import { Router } from 'express';
import passport from '../passport.js';
import { AuthController } from '../controllers/authController.js';
import { authenticateToken, requireRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// ==========================================
// 1. Google OAuth & Session Routes (/auth/*)
// ==========================================
router.get('/google', (req, res, next) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const consent = req.query.consent;

  // Enforce consent before redirecting to Google OAuth (Point 1: cannot be skipped)
  if (consent !== 'true' && consent !== '1') {
    return res.redirect(`${clientUrl}/login?error=consent_required`);
  }

  const statePayload = Buffer.from(
    JSON.stringify({ consent: true, timestamp: Date.now() })
  ).toString('base64url');

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: statePayload,
  })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  // Verify OAuth state contains valid consent confirmation
  const stateQuery = req.query.state as string | undefined;
  let hasConsent = false;
  if (stateQuery) {
    try {
      const decoded = JSON.parse(Buffer.from(stateQuery, 'base64url').toString('utf8'));
      if (decoded && decoded.consent === true) {
        hasConsent = true;
      }
    } catch {
      hasConsent = false;
    }
  }

  if (!hasConsent) {
    console.warn('[google/callback] Missing or invalid consent state; redirecting to login.');
    return res.redirect(`${clientUrl}/login?error=consent_required`);
  }

  passport.authenticate('google', (err: any, user: any, info: any) => {
    console.log('[google/callback] err=', err, 'user=', user, 'info=', info);
    if (err || !user) {
      return res.redirect(`${clientUrl}/login`);
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.log('[google/callback] req.logIn error=', loginErr);
        return res.redirect(`${clientUrl}/login`);
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
