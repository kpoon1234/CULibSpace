import { Response } from 'express';
import { AuthService } from '../services/authService.js';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';

export class AuthController {
  /**
   * POST /api/auth/login (or /api/auth/google)
   * Exchange authenticated email & profile for JWT session with mapped role (US1-1 / FR-1.1)
   */
  static async login(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { email, firstname, lastname, phone, studentId } = req.body;

      if (!email || !firstname || !lastname) {
        res.status(400).json({
          success: false,
          error: 'Email, firstname, and lastname are required',
        });
        return;
      }

      const result = await AuthService.authenticateUser({
        email,
        firstname,
        lastname,
        phone,
        studentId,
      });

      res.status(200).json({
        success: true,
        message: 'Authentication and role mapping successful',
        ...result,
      });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Internal server error',
      });
    }
  }

  /**
   * GET /api/auth/me
   * Return current authenticated user session profile (US1-1)
   */
  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Valid session required',
        });
        return;
      }

      const user = await AuthService.getCurrentProfile(req.user);
      res.status(200).json({
        success: true,
        user,
      });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Internal server error',
      });
    }
  }
}
