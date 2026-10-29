import { PrismaClient, SystemConfig } from '@prisma/client';

const defaultPrisma = new PrismaClient();

export interface UpdateSystemConfigInput {
  maxBookingDurationMinutes?: number;
  lateThresholdMinutes?: number;
  earlyCheckInMinutes?: number;
  minScoreToBook?: number;
  maxAdvanceBookingDays?: number;
  ticketPriceSatang?: number;
  ticketValidityHours?: number;
  paymentCheckoutExpiryMinutes?: number;
}

const DEFAULT_CONFIG_VALUES: Omit<SystemConfig, 'configId' | 'updatedAt'> = {
  maxBookingDurationMinutes: 120,
  lateThresholdMinutes: 15,
  earlyCheckInMinutes: 15,
  minScoreToBook: 50,
  maxAdvanceBookingDays: 7,
  ticketPriceSatang: 5000,
  ticketValidityHours: 2,
  paymentCheckoutExpiryMinutes: 30,
};

export class AdminConfigService {
  /**
   * Get current system configuration. If record doesn't exist, seed with default values.
   */
  static async getConfig(prisma: PrismaClient = defaultPrisma): Promise<SystemConfig> {
    let config = await prisma.systemConfig.findFirst();
    if (!config) {
      config = await prisma.systemConfig.create({
        data: {
          configId: 1,
          ...DEFAULT_CONFIG_VALUES,
        },
      });
    }
    return config;
  }

  /**
   * Update booking policy parameters and system configuration with validation.
   *
   * Wraps the entire read-validate-write cycle inside a serialized interactive transaction
   * protected by an advisory lock (key 7402, slot 1) to prevent concurrent PATCH requests
   * from each reading a stale snapshot, both passing validation, and writing conflicting values
   * (e.g. two requests that together set lateThreshold >= maxDuration).
   */
  static async updateConfig(
    input: UpdateSystemConfigInput,
    prisma: PrismaClient = defaultPrisma
  ): Promise<SystemConfig> {
    const runInTx = async (tx: any): Promise<SystemConfig> => {
      // Acquire advisory lock so concurrent updateConfig calls are serialized.
      // Key 7402 (config namespace), slot 1 (single config row).
      // NOTE: pg_advisory_xact_lock(int, int) requires both params as PostgreSQL integer.
      // Prisma $executeRaw sends JS numbers as bigint → error 42883 on two-param form.
      // ::integer cast in the SQL string resolves the type mismatch.
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(7402, 1::integer)`;
      } else if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7402, 1::integer)`;
      }

      // Read inside the lock so we always see the most up-to-date committed values.
      let current = await tx.systemConfig.findFirst();
      if (!current) {
        current = await tx.systemConfig.create({
          data: { configId: 1, ...DEFAULT_CONFIG_VALUES },
        });
      }

      const updateData: Partial<SystemConfig> = {};

      const effectiveMaxDuration =
        input.maxBookingDurationMinutes !== undefined
          ? Number(input.maxBookingDurationMinutes)
          : current.maxBookingDurationMinutes;

      const effectiveLateThreshold =
        input.lateThresholdMinutes !== undefined
          ? Number(input.lateThresholdMinutes)
          : current.lateThresholdMinutes;

      if (input.maxBookingDurationMinutes !== undefined) {
        const val = Number(input.maxBookingDurationMinutes);
        if (!Number.isSafeInteger(val) || val < 15 || val > 1440) {
          throw {
            status: 400,
            message:
              'maxBookingDurationMinutes must be an integer between 15 and 1440 minutes (24 hours)',
          };
        }
        updateData.maxBookingDurationMinutes = val;
      }

      if (input.lateThresholdMinutes !== undefined) {
        const val = Number(input.lateThresholdMinutes);
        if (!Number.isSafeInteger(val) || val < 1 || val > 60) {
          throw {
            status: 400,
            message: 'lateThresholdMinutes must be an integer between 1 and 60 minutes',
          };
        }
        updateData.lateThresholdMinutes = val;
      }

      // Cross-field invariant: lateThreshold must be strictly less than maxDuration.
      // Checked against fresh locked data to catch concurrent updates.
      if (effectiveLateThreshold >= effectiveMaxDuration) {
        throw {
          status: 400,
          message: `lateThresholdMinutes (${effectiveLateThreshold}) must be strictly less than maxBookingDurationMinutes (${effectiveMaxDuration})`,
        };
      }

      if (input.earlyCheckInMinutes !== undefined) {
        const val = Number(input.earlyCheckInMinutes);
        if (!Number.isSafeInteger(val) || val < 0 || val > 60) {
          throw {
            status: 400,
            message: 'earlyCheckInMinutes must be an integer between 0 and 60 minutes',
          };
        }
        updateData.earlyCheckInMinutes = val;
      }

      if (input.minScoreToBook !== undefined) {
        const val = Number(input.minScoreToBook);
        if (Number.isNaN(val) || val < 0 || val > 100) {
          throw {
            status: 400,
            message: 'minScoreToBook must be a score between 0 and 100',
          };
        }
        updateData.minScoreToBook = Math.round(val);
      }

      if (input.maxAdvanceBookingDays !== undefined) {
        const val = Number(input.maxAdvanceBookingDays);
        if (!Number.isSafeInteger(val) || val < 1 || val > 90) {
          throw {
            status: 400,
            message: 'maxAdvanceBookingDays must be an integer between 1 and 90 days',
          };
        }
        updateData.maxAdvanceBookingDays = val;
      }

      if (input.ticketPriceSatang !== undefined) {
        const val = Number(input.ticketPriceSatang);
        // Stripe minimum charge for THB-settled accounts is 1,000 satang (10 THB).
        // Accepting 1–999 would cause Stripe to return INVALID_TICKET_PRICE / 503.
        if (!Number.isSafeInteger(val) || val < 1000) {
          throw {
            status: 400,
            message:
              'ticketPriceSatang must be at least 1000 satang (10 THB, Stripe minimum charge for THB)',
          };
        }
        updateData.ticketPriceSatang = val;
      }

      if (input.ticketValidityHours !== undefined) {
        const val = Number(input.ticketValidityHours);
        if (!Number.isSafeInteger(val) || val < 1 || val > 72) {
          throw {
            status: 400,
            message: 'ticketValidityHours must be an integer between 1 and 72 hours',
          };
        }
        updateData.ticketValidityHours = val;
      }

      if (input.paymentCheckoutExpiryMinutes !== undefined) {
        const val = Number(input.paymentCheckoutExpiryMinutes);
        if (!Number.isSafeInteger(val) || val < 30 || val > 1440) {
          throw {
            status: 400,
            message: 'paymentCheckoutExpiryMinutes must be an integer >= 30 minutes',
          };
        }
        updateData.paymentCheckoutExpiryMinutes = val;
      }

      if (Object.keys(updateData).length === 0) {
        return current;
      }

      return await tx.systemConfig.update({
        where: { configId: current.configId },
        data: updateData,
      });
    };

    if (typeof (prisma as any).$transaction === 'function') {
      return await (prisma as any).$transaction(runInTx);
    }
    return await runInTx(prisma);
  }
}
