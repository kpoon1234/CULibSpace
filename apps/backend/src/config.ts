import 'dotenv/config';

/**
 * Centralized Application Configuration (12-Factor App Pattern)
 * Single source of truth for all environment variables with clean defaults.
 */
export const config = {
  // Server runtime
  port: Number(process.env.PORT || 8080),
  get baseUrl(): string {
    return process.env.BASE_URL || `http://localhost:${this.port}`;
  },
  get clientUrl(): string {
    return process.env.CLIENT_URL || 'http://localhost:3000';
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },

  // Authentication & Sessions
  jwt: {
    get secret(): string {
      return process.env.JWT_SECRET || 'culibspace_default_jwt_secret_change_me';
    },
    get expiresIn(): string {
      return process.env.JWT_EXPIRES_IN || '7d';
    },
  },
  session: {
    get secret(): string {
      return process.env.SESSION_SECRET || 'fallback-session-secret';
    },
  },

  // Google OAuth 2.0
  google: {
    get clientId(): string {
      return process.env.GOOGLE_CLIENT_ID || '';
    },
    get clientSecret(): string {
      return process.env.GOOGLE_CLIENT_SECRET || '';
    },
    get callbackUrl(): string {
      return process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback';
    },
  },

  // Payment Gateway (Stripe)
  stripe: {
    get secretKey(): string | undefined {
      return process.env.STRIPE_SECRET_KEY;
    },
    get webhookSecret(): string | undefined {
      return process.env.STRIPE_WEBHOOK_SECRET;
    },
    get timeoutMs(): number {
      return Number(process.env.PAYMENT_GATEWAY_TIMEOUT_MS || 10_000);
    },
    // Dynamically derived from CLIENT_URL unless explicitly configured
    get successUrl(): string {
      return (
        process.env.TICKET_CHECKOUT_SUCCESS_URL ||
        process.env.NEXT_PUBLIC_CHECKOUT_SUCCESS_URL ||
        `${config.clientUrl}/tickets/success`
      );
    },
    get cancelUrl(): string {
      return (
        process.env.TICKET_CHECKOUT_CANCEL_URL ||
        process.env.NEXT_PUBLIC_CHECKOUT_CANCEL_URL ||
        `${config.clientUrl}/visitor/ticket`
      );
    },
  },
};
