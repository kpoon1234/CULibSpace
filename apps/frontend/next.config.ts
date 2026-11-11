import type { NextConfig } from 'next';

const internalApiUrl = (process.env.INTERNAL_API_URL || 'http://localhost:8080').replace(
  /\/+$/,
  ''
);

const nextConfig: NextConfig = {
  allowedDevOrigins: ['culibspace.andyntk.online', '*.trycloudflare.com'],
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
