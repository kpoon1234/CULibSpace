import { Request, Response, NextFunction } from 'express';
import { verifyJwt, AuthTokenPayload } from '../utils/jwt.js';
import { AppRole } from '../utils/roleMapper.js';

// Extend Express Request interface to include user payload
export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

/**
 * Middleware to authenticate requests using JWT Bearer Token.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid Bearer token',
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  const payload = verifyJwt(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Token is invalid or expired',
    });
    return;
  }

  (req as AuthenticatedRequest).user = payload;
  next();
}

/**
 * RBAC Authorization Guard middleware to enforce required roles.
 */
export function requireRoles(...allowedRoles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Access restricted to roles: [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}
