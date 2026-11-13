import type { NextConfig } from 'next';

const internalApiUrl = (process.env.INTERNAL_API_URL || 'http://localhost:8080').replace(
  /\/+$/,
  ''
);

const nextConfig: NextConfig = {
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
