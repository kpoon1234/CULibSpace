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
   */
  static async updateConfig(
    input: UpdateSystemConfigInput,
    prisma: PrismaClient = defaultPrisma
  ): Promise<SystemConfig> {
    const current = await this.getConfig(prisma);

    const updateData: Partial<SystemConfig> = {};

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
      if (!Number.isSafeInteger(val) || val < 1 || val > 120) {
        throw {
          status: 400,
          message: 'lateThresholdMinutes must be an integer between 1 and 120 minutes',
        };
      }
      updateData.lateThresholdMinutes = val;
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
      if (!Number.isSafeInteger(val) || val < 0) {
        throw {
          status: 400,
          message: 'ticketPriceSatang must be a non-negative integer',
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

    return await prisma.systemConfig.update({
      where: { configId: current.configId },
      data: updateData,
    });
  }
}
