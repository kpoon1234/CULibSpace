import { Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { signJwt } from '../utils/jwt.js';

const prisma = new PrismaClient();

export class AuthController {
  /**
   * POST /api/auth/login (or /api/auth/google)
   * Exchange authenticated email & profile for JWT session with mapped role (US1-1 / FR-1.1)
   */
  static async login(req: Request, res: Response): Promise<void> {
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
  static async getMe(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Valid session required',
        });
        return;
      }

      const user = await AuthService.getCurrentProfile(authReq.user);
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

  /**
   * GET /auth/google/callback
   */
  static googleCallback(req: Request, res: Response): void {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const user = req.user as any;
    const token = user?.token;

    if (token) {
      res.redirect(`${clientUrl}/auth/callback?token=${encodeURIComponent(token)}`);
    } else {
      res.redirect(`${clientUrl}/auth/callback`);
    }
  }

  /**
   * POST /auth/logout
   */
  static logout(req: Request, res: Response): void {
    req.logout((err) => {
      if (err) {
        res.status(500).json({ error: 'Logout failed' });
        return;
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  }

  /**
   * GET /auth/me (Session-based)
   */
  static getSessionMe(req: Request, res: Response): void {
    if (!req.isAuthenticated() || !req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ user: req.user });
  }

  /**
   * GET /api/protected/profile (Protected RBAC)
   */
  static getProfile(req: Request, res: Response): void {
    const authReq = req as AuthenticatedRequest;
    res.json({
      message: 'Access granted to authenticated profile',
      user: authReq.user,
    });
  }

  /**
   * GET /api/protected/student-only (Protected RBAC)
   */
  static getStudentArea(req: Request, res: Response): void {
    const authReq = req as AuthenticatedRequest;
    res.json({
      message: 'Access granted: Student area',
      studentId: authReq.user?.studentId,
    });
  }

  /**
   * GET /api/protected/admin-only (Protected RBAC)
   */
  static getAdminArea(req: Request, res: Response): void {
    const authReq = req as AuthenticatedRequest;
    res.json({
      message: 'Access granted: Admin area',
      adminId: authReq.user?.adminId,
    });
  }

  /**
   * POST /api/auth/admin-login
   */
  static async adminLogin(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ success: false, error: 'Email and password are required' });
        return;
      }

      const admin = await prisma.admin.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (!admin) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }

      const token = signJwt({
        adminId: admin.adminId,
        email: admin.email,
        firstname: admin.firstname,
        lastname: admin.lastname,
        role: 'ADMIN',
      });

      res.status(200).json({
        success: true,
        message: 'Admin login successful',
        token,
        user: {
          adminId: admin.adminId,
          email: admin.email,
          firstname: admin.firstname,
          lastname: admin.lastname,
          role: 'ADMIN',
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}
