import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import type { PrismaClient } from '@prisma/client';
import passport from './passport.js';
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import layoutRoutes from './routes/layoutRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import systemConfigRoutes from './routes/systemConfigRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import issueRoutes from './routes/issueRoutes.js';
import { createPaymentWebhookRouter } from './routes/paymentWebhookRoutes.js';
import type { PaymentGateway } from './services/paymentGateway.js';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiSpec } from './openapi/openapi.js';

interface AppOptions {
  environment?: NodeJS.ProcessEnv;
  paymentGatewayFactory?: () => PaymentGateway;
  paymentPrisma?: PrismaClient;
}

/** Shared HTTP setup. Listening and background workers belong to server.ts. */
export function createApp(options: AppOptions = {}) {
  const environment = options.environment ?? process.env;
  const app = express();
  const trustedProxies = environment.TRUST_PROXY?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  // Trust only configured proxy IPs/CIDRs; never all forwarded headers.
  app.set('trust proxy', trustedProxies?.length ? trustedProxies : false);

  app.use(
    cors({
      origin: environment.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
    })
  );

  // Stripe signs the exact bytes: mount webhook BEFORE the global JSON parser.
  app.use(
    '/api/tickets',
    createPaymentWebhookRouter(options.paymentGatewayFactory, options.paymentPrisma)
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    console.log(`[req] ${req.method} ${req.originalUrl}`);
    next();
  });
  app.use(
    session({
      secret: environment.SESSION_SECRET || 'fallback-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: environment.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/tables/layout', layoutRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/system-config', systemConfigRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/issues', issueRoutes);

  app.get('/api/hello', (_req, res) => {
    res.json({ message: 'Hello! Communication between Next.js and Express is working!' });
  });

  // API documentation (OpenAPI 3.0): UI at /api-docs, raw spec at /api-docs.json
  const openApiSpec = buildOpenApiSpec(environment);
  app.get('/api-docs.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'CU LibSpace API Docs',
      swaggerOptions: { persistAuthorization: true },
    })
  );

  return app;
}
