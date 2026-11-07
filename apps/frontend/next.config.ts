import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.trycloudflare.com', '*.localtunnel.me'],
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
