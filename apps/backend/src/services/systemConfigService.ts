import { PrismaClient } from '@prisma/client';
import {
  STRIPE_MIN_CHECKOUT_EXPIRY_MINUTES,
  STRIPE_MAX_CHECKOUT_EXPIRY_MINUTES,
} from './stripePaymentGateway.js';

const defaultPrisma = new PrismaClient();

/** Stripe requires at least 10.00 THB (1,000 satang) for THB settlement. */
export const MIN_TICKET_PRICE_SATANG = 1000;
export const MAX_PRISMA_INT = 2_147_483_647;
export const MAX_MINUTES_PER_DAY = 1440;
export const MAX_ADVANCE_DAYS_LIMIT = 365;

export const DEFAULT_SYSTEM_CONFIG = {
  configId: 1,
  maxBookingDurationMinutes: 120,
  maxAdvanceBookingDays: 7,
  minScoreToBook: 50,
  earlyCheckInMinutes: 15,
  lateThresholdMinutes: 15,
  ticketPriceSatang: 5000,
  ticketValidityHours: 2,
  paymentCheckoutExpiryMinutes: 30,
} as const;

export const SUPPORTED_POLICY_FIELDS = [
  'maxBookingDurationMinutes',
  'maxAdvanceBookingDays',
  'minScoreToBook',
  'earlyCheckInMinutes',
  'lateThresholdMinutes',
  'ticketPriceSatang',
  'ticketValidityHours',
  'paymentCheckoutExpiryMinutes',
] as const;

export type SupportedPolicyField = (typeof SUPPORTED_POLICY_FIELDS)[number];

const SUPPORTED_FIELD_SET = new Set<string>(SUPPORTED_POLICY_FIELDS);

export interface BookingPolicyUpdateInput {
  maxBookingDurationMinutes?: unknown;
  maxAdvanceBookingDays?: unknown;
  minScoreToBook?: unknown;
  earlyCheckInMinutes?: unknown;
  lateThresholdMinutes?: unknown;
  ticketPriceSatang?: unknown;
  ticketValidityHours?: unknown;
  paymentCheckoutExpiryMinutes?: unknown;
  [key: string]: unknown;
}

export interface ValidatedBookingPolicy {
  maxBookingDurationMinutes: number;
  maxAdvanceBookingDays: number;
  minScoreToBook: number;
  earlyCheckInMinutes: number;
  lateThresholdMinutes: number;
  ticketPriceSatang: number;
  ticketValidityHours: number;
  paymentCheckoutExpiryMinutes: number;
}

export interface PolicyFieldError {
  field: string;
  message: string;
}

function parseStrictInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === 'string' && /^[+-]?\d+\$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export class SystemConfigService {
  /**
   * ตรวจสอบความถูกต้องของพารามิเตอร์ทุกตัว ปฏิเสธ unknown fields
   * และตรวจว่ามี supported field อย่างน้อย 1 ตัว
   */
  static validatePolicyInput(
    input: BookingPolicyUpdateInput,
    current: ValidatedBookingPolicy
  ): { data?: Partial<ValidatedBookingPolicy>; errors: PolicyFieldError[] } {
    const errors: PolicyFieldError[] = [];
    const updates: Partial<ValidatedBookingPolicy> = {};

    const allKeys = Object.keys(input);
    const unknownKeys = allKeys.filter((k) => !SUPPORTED_FIELD_SET.has(k));
    for (const unknownKey of unknownKeys) {
      errors.push({
        field: unknownKey,
        message: `Unknown policy parameter "${unknownKey}".`,
      });
    }

    const providedSupportedKeys = SUPPORTED_POLICY_FIELDS.filter((k) => input[k] !== undefined);

    if (providedSupportedKeys.length === 0) {
      errors.push({
        field: 'body',
        message: 'At least one supported policy parameter must be provided.',
      });
      return { errors };
    }

    // 1. maxBookingDurationMinutes (15 .. 1440)
    if (input.maxBookingDurationMinutes !== undefined) {
      const val = parseStrictInteger(input.maxBookingDurationMinutes);
      if (val === null || val < 15 || val > MAX_MINUTES_PER_DAY) {
        errors.push({
          field: 'maxBookingDurationMinutes',
          message: `maxBookingDurationMinutes must be an integer between 15 and ${MAX_MINUTES_PER_DAY}.`,
        });
      } else {
        updates.maxBookingDurationMinutes = val;
      }
    }

    // 2. maxAdvanceBookingDays (1 .. 365)
    if (input.maxAdvanceBookingDays !== undefined) {
      const val = parseStrictInteger(input.maxAdvanceBookingDays);
      if (val === null || val < 1 || val > MAX_ADVANCE_DAYS_LIMIT) {
        errors.push({
          field: 'maxAdvanceBookingDays',
          message: `maxAdvanceBookingDays must be an integer between 1 and ${MAX_ADVANCE_DAYS_LIMIT}.`,
        });
      } else {
        updates.maxAdvanceBookingDays = val;
      }
    }

    // 3. minScoreToBook (0 .. 100)
    if (input.minScoreToBook !== undefined) {
      const val = parseStrictInteger(input.minScoreToBook);
      if (val === null || val < 0 || val > 100) {
        errors.push({
          field: 'minScoreToBook',
          message: 'minScoreToBook must be an integer between 0 and 100.',
        });
      } else {
        updates.minScoreToBook = val;
      }
    }

    // 4. earlyCheckInMinutes (1 .. 180)
    if (input.earlyCheckInMinutes !== undefined) {
      const val = parseStrictInteger(input.earlyCheckInMinutes);
      if (val === null || val < 1 || val > 180) {
        errors.push({
          field: 'earlyCheckInMinutes',
          message: 'earlyCheckInMinutes must be an integer between 1 and 180.',
        });
      } else {
        updates.earlyCheckInMinutes = val;
      }
    }

    // 5. lateThresholdMinutes (1 .. 180)
    if (input.lateThresholdMinutes !== undefined) {
      const val = parseStrictInteger(input.lateThresholdMinutes);
      if (val === null || val < 1 || val > 180) {
        errors.push({
          field: 'lateThresholdMinutes',
          message: 'lateThresholdMinutes must be an integer between 1 and 180.',
        });
      } else {
        updates.lateThresholdMinutes = val;
      }
    }

    // 6. ticketPriceSatang (1000 .. MAX_PRISMA_INT ตามขั้นต่ำของ Stripe THB)
    if (input.ticketPriceSatang !== undefined) {
      const val = parseStrictInteger(input.ticketPriceSatang);
      if (val === null || val < MIN_TICKET_PRICE_SATANG || val > MAX_PRISMA_INT) {
        errors.push({
          field: 'ticketPriceSatang',
          message: `ticketPriceSatang must be an integer between ${MIN_TICKET_PRICE_SATANG} and ${MAX_PRISMA_INT}.`,
        });
      } else {
        updates.ticketPriceSatang = val;
      }
    }

    // 7. ticketValidityHours (1 .. 720)
    if (input.ticketValidityHours !== undefined) {
      const val = parseStrictInteger(input.ticketValidityHours);
      if (val === null || val < 1 || val > 720) {
        errors.push({
          field: 'ticketValidityHours',
          message: 'ticketValidityHours must be an integer between 1 and 720.',
        });
      } else {
        updates.ticketValidityHours = val;
      }
    }

    // 8. paymentCheckoutExpiryMinutes (30 .. 1440 ตามข้อกำหนด Stripe)
    if (input.paymentCheckoutExpiryMinutes !== undefined) {
      const val = parseStrictInteger(input.paymentCheckoutExpiryMinutes);
      if (
        val === null ||
        val < STRIPE_MIN_CHECKOUT_EXPIRY_MINUTES ||
        val > STRIPE_MAX_CHECKOUT_EXPIRY_MINUTES
      ) {
        errors.push({
          field: 'paymentCheckoutExpiryMinutes',
          message: `paymentCheckoutExpiryMinutes must be between ${STRIPE_MIN_CHECKOUT_EXPIRY_MINUTES} and ${STRIPE_MAX_CHECKOUT_EXPIRY_MINUTES}.`,
        });
      } else {
        updates.paymentCheckoutExpiryMinutes = val;
      }
    }

    // Cross-field invariant: lateThresholdMinutes ต้องน้อยกว่า maxBookingDurationMinutes
    const effectiveDuration =
      updates.maxBookingDurationMinutes ?? current.maxBookingDurationMinutes;
    const effectiveLateThreshold = updates.lateThresholdMinutes ?? current.lateThresholdMinutes;

    if (errors.length === 0 && effectiveLateThreshold >= effectiveDuration) {
      errors.push({
        field: 'lateThresholdMinutes',
        message: 'lateThresholdMinutes must be strictly less than maxBookingDurationMinutes.',
      });
    }

    if (errors.length > 0 || Object.keys(updates).length === 0) {
      return { errors };
    }

    return { data: updates, errors: [] };
  }

  /**
   * ดึงค่า Policy ปัจจุบันทั้งหมด
   */
  static async getPolicy(prisma: any = defaultPrisma) {
    const config = await prisma.systemConfig.findFirst({
      orderBy: { configId: 'asc' },
    });

    return {
      configId: config?.configId ?? DEFAULT_SYSTEM_CONFIG.configId,
      maxBookingDurationMinutes:
        config?.maxBookingDurationMinutes ?? DEFAULT_SYSTEM_CONFIG.maxBookingDurationMinutes,
      maxAdvanceBookingDays:
        config?.maxAdvanceBookingDays ?? DEFAULT_SYSTEM_CONFIG.maxAdvanceBookingDays,
      minScoreToBook: Number(config?.minScoreToBook ?? DEFAULT_SYSTEM_CONFIG.minScoreToBook),
      earlyCheckInMinutes: config?.earlyCheckInMinutes ?? DEFAULT_SYSTEM_CONFIG.earlyCheckInMinutes,
      lateThresholdMinutes:
        config?.lateThresholdMinutes ?? DEFAULT_SYSTEM_CONFIG.lateThresholdMinutes,
      ticketPriceSatang: config?.ticketPriceSatang ?? DEFAULT_SYSTEM_CONFIG.ticketPriceSatang,
      ticketValidityHours: config?.ticketValidityHours ?? DEFAULT_SYSTEM_CONFIG.ticketValidityHours,
      paymentCheckoutExpiryMinutes:
        config?.paymentCheckoutExpiryMinutes ?? DEFAULT_SYSTEM_CONFIG.paymentCheckoutExpiryMinutes,
    };
  }

  /**
   * อัปเดตนโยบายการจองแบบ Atomic & Isolated (ACID)
   * รองรับกรณีตารางว่างและมีคำขอพร้อมกันโดยใช้ Advisory Lock + Safe Singleton Initialization
   */
  static async updatePolicy(
    adminId: number,
    input: BookingPolicyUpdateInput,
    prisma: any = defaultPrisma
  ) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw {
        status: 400,
        code: 'INVALID_POLICY_PAYLOAD',
        message: 'A valid JSON object is required.',
      };
    }

    return await prisma.$transaction(async (tx: any) => {
      // 1. ตรวจสอบว่า Admin มีตัวตนอยู่ในระบบจริง
      const admin = await tx.admin.findUnique({
        where: { adminId },
        select: { adminId: true },
      });
      if (!admin) {
        throw {
          status: 403,
          code: 'ADMIN_NOT_FOUND',
          message: 'Invalid admin account.',
        };
      }

      // 2. Serialize ทั้งกรณีตารางว่างและมีแถวอยู่แล้วด้วย Transaction-level Advisory Lock
      //    ตามด้วย Row-level Lock บนแถวที่มีอยู่ เพื่อให้ผู้เขียนทุกรายรอคิวกันอย่างปลอดภัย
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(704001)`;
      await tx.$queryRaw`SELECT configid FROM "system_config" ORDER BY configid ASC FOR UPDATE`;

      let existing = await tx.systemConfig.findFirst({
        orderBy: { configId: 'asc' },
      });

      const currentPolicy: ValidatedBookingPolicy = {
        maxBookingDurationMinutes:
          existing?.maxBookingDurationMinutes ?? DEFAULT_SYSTEM_CONFIG.maxBookingDurationMinutes,
        maxAdvanceBookingDays:
          existing?.maxAdvanceBookingDays ?? DEFAULT_SYSTEM_CONFIG.maxAdvanceBookingDays,
        minScoreToBook: Number(existing?.minScoreToBook ?? DEFAULT_SYSTEM_CONFIG.minScoreToBook),
        earlyCheckInMinutes:
          existing?.earlyCheckInMinutes ?? DEFAULT_SYSTEM_CONFIG.earlyCheckInMinutes,
        lateThresholdMinutes:
          existing?.lateThresholdMinutes ?? DEFAULT_SYSTEM_CONFIG.lateThresholdMinutes,
        ticketPriceSatang: existing?.ticketPriceSatang ?? DEFAULT_SYSTEM_CONFIG.ticketPriceSatang,
        ticketValidityHours:
          existing?.ticketValidityHours ?? DEFAULT_SYSTEM_CONFIG.ticketValidityHours,
        paymentCheckoutExpiryMinutes:
          existing?.paymentCheckoutExpiryMinutes ??
          DEFAULT_SYSTEM_CONFIG.paymentCheckoutExpiryMinutes,
      };

      // 3. Validate ค่าใหม่เทียบกับค่าปัจจุบันภายใต้ Lock (ถ้าไม่ผ่านจะ throw ก่อนเขียน DB)
      const validation = this.validatePolicyInput(input, currentPolicy);
      if (validation.errors.length > 0 || !validation.data) {
        throw {
          status: 400,
          code: 'INVALID_BOOKING_POLICY',
          message: validation.errors[0].message,
          errors: validation.errors,
        };
      }

      // 4. หากตารางว่างและมีคำขออื่นแทรกสร้างแถวไปแล้ว (fallback P2002 safety)
      let saved: any;
      if (existing) {
        saved = await tx.systemConfig.update({
          where: { configId: existing.configId },
          data: validation.data,
        });
      } else {
        try {
          saved = await tx.systemConfig.create({
            data: {
              configId: DEFAULT_SYSTEM_CONFIG.configId,
              ...currentPolicy,
              ...validation.data,
            },
          });
        } catch (err: any) {
          if (err?.code !== 'P2002') throw err;
          existing = await tx.systemConfig.findFirst({
            orderBy: { configId: 'asc' },
          });
          if (!existing) throw err;

          const refreshedPolicy: ValidatedBookingPolicy = {
            maxBookingDurationMinutes: existing.maxBookingDurationMinutes,
            maxAdvanceBookingDays: existing.maxAdvanceBookingDays,
            minScoreToBook: Number(existing.minScoreToBook),
            earlyCheckInMinutes: existing.earlyCheckInMinutes,
            lateThresholdMinutes: existing.lateThresholdMinutes,
            ticketPriceSatang: existing.ticketPriceSatang,
            ticketValidityHours: existing.ticketValidityHours,
            paymentCheckoutExpiryMinutes: existing.paymentCheckoutExpiryMinutes,
          };
          const revalidated = this.validatePolicyInput(input, refreshedPolicy);
          if (revalidated.errors.length > 0 || !revalidated.data) {
            throw {
              status: 400,
              code: 'INVALID_BOOKING_POLICY',
              message: revalidated.errors[0].message,
              errors: revalidated.errors,
            };
          }
          saved = await tx.systemConfig.update({
            where: { configId: existing.configId },
            data: revalidated.data,
          });
        }
      }

      return {
        configId: saved.configId,
        maxBookingDurationMinutes: saved.maxBookingDurationMinutes,
        maxAdvanceBookingDays: saved.maxAdvanceBookingDays,
        minScoreToBook: Number(saved.minScoreToBook),
        earlyCheckInMinutes: saved.earlyCheckInMinutes,
        lateThresholdMinutes: saved.lateThresholdMinutes,
        ticketPriceSatang: saved.ticketPriceSatang,
        ticketValidityHours: saved.ticketValidityHours,
        paymentCheckoutExpiryMinutes: saved.paymentCheckoutExpiryMinutes,
      };
    });
  }
}
