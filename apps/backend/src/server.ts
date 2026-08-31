import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from './passport.js';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/authRoutes.js';
import {
  authenticateToken,
  requireRoles,
  AuthenticatedRequest,
} from './middlewares/authMiddleware.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:3000'}/login`,
  }),
  (req, res) => {
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback`);
  }
);

app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/auth/me', (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ user: req.user });
});

// Mount Authentication & Role Management Routes
app.use('/api/auth', authRoutes);

// Example / Test Protected Endpoints to demonstrate RBAC
app.get('/api/protected/profile', authenticateToken, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({
    message: 'Access granted to authenticated profile',
    user: authReq.user,
  });
});

app.get('/api/protected/student-only', authenticateToken, requireRoles('STUDENT'), (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({
    message: 'Access granted: Student area',
    studentId: authReq.user?.studentId,
  });
});

app.get('/api/protected/admin-only', authenticateToken, requireRoles('ADMIN'), (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({
    message: 'Access granted: Admin area',
    adminId: authReq.user?.adminId,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on ${BASE_URL}`);
});
