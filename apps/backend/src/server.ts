import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from './passport.js';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// Global Middlewares
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

// Mount Routers
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', authRoutes);

// Health check / diagnostic endpoint
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello! Communication between Next.js and Express is working!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on ${BASE_URL}`);
});
