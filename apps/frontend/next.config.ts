import type { NextConfig } from 'next';

const allowedDevOrigins = [
  '*.ngrok-free.dev',
  '*.ngrok-free.app',
  '*.ngrok.app',
  '*.ngrok.io',
  '*.trycloudflare.com',
  '*.localtunnel.me',
  '*.loca.lt',
];

// Automatically allow the domain/subdomain configured in CLIENT_URL (e.g. for home cloud server)
if (process.env.CLIENT_URL) {
  try {
    const url = new URL(process.env.CLIENT_URL);
    if (url.hostname && !allowedDevOrigins.includes(url.hostname)) {
      allowedDevOrigins.push(url.hostname);
      if (!url.hostname.startsWith('*.')) {
        allowedDevOrigins.push(`*.${url.hostname}`);
      }
    }
  } catch {
    // Ignore invalid URL string
  }
}

if (process.env.ALLOWED_DEV_ORIGINS) {
  const customOrigins = process.env.ALLOWED_DEV_ORIGINS.split(',').map((o) => o.trim());
  allowedDevOrigins.push(...customOrigins);
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.INTERNAL_API_URL || 'http://localhost:8080'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
