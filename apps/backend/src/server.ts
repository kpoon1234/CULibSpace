import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
  })
);
app.use(express.json());

// Mount Authentication & Role Management Routes
app.use('/api/auth', authRoutes);

// Example / Test Protected Endpoints to demonstrate RBAC
app.get('/api/protected/profile', authenticateToken, (req: AuthenticatedRequest, res) => {
  res.json({
    message: 'Access granted to authenticated profile',
    user: req.user,
  });
});

app.get(
  '/api/protected/student-only',
  authenticateToken,
  requireRoles('STUDENT'),
  (req: AuthenticatedRequest, res) => {
    res.json({
      message: 'Access granted: Student area',
      studentId: req.user?.studentId,
    });
  }
);

app.get(
  '/api/protected/admin-only',
  authenticateToken,
  requireRoles('ADMIN'),
  (req: AuthenticatedRequest, res) => {
    res.json({
      message: 'Access granted: Admin area',
      adminId: req.user?.adminId,
    });
  }
);

// API Endpoint ตัวอย่างสำหรับส่งข้อมูลไป Frontend
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users from database' });
  }
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello! Communication between Next.js and Express is working!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
