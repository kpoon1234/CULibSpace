import type { RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  BOOKING_POLICY_FIELDS,
  readBookingPolicy,
  type PolicyClient,
} from '../services/bookingPolicyService.js';

const prisma = new PrismaClient();

/** Public, read-only saved limits. Dependency injection never occupies Express's next argument. */
export function createBookingLimitsHandler(client: PolicyClient): RequestHandler {
  return async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const policy = await readBookingPolicy(client, BOOKING_POLICY_FIELDS);
      res.status(200).json({ success: true, data: policy });
    } catch (error) {
      const failure = error as { status?: number; code?: string; message?: string };
      res.status(failure.status ?? 500).json({
        success: false,
        code: failure.code ?? 'BOOKING_SETTINGS_UNAVAILABLE',
        error: failure.status ? failure.message : 'Booking settings are temporarily unavailable.',
      });
    }
  };
}

export class SystemConfigController {
  static getBookingLimits = createBookingLimitsHandler(prisma);
}
