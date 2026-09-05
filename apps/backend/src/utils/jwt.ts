import jwt from 'jsonwebtoken';
import { UserType } from '@prisma/client';
import { AppRole } from './roleMapper.js';

export interface AuthTokenPayload {
  uid?: number;
  adminId?: number;
  email: string;
  firstname: string;
  lastname: string;
  role: AppRole;
  userType?: UserType;
  studentId?: string;
  isProfileComplete?: boolean;
  requiresOnboarding?: boolean;
}

const JWT_SECRET: jwt.Secret = process.env.JWT_SECRET || 'culibspace_default_jwt_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Sign a new JWT token with user or admin claims.
 */
export function signJwt(payload: AuthTokenPayload): string {
  // Use plain object for jwt payload
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verify and decode an incoming JWT token.
 * Returns decoded payload if valid, null otherwise.
 */
export function verifyJwt(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}
