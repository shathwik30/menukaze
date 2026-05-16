import type { NextConfig } from 'next';

const qrDineinUrl = process.env['QR_DINEIN_URL'];
const kioskUrl = process.env['KIOSK_URL'];

const config: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async rewrites() {
    const rules: { source: string; destination: string }[] = [];
    if (qrDineinUrl) {
      rules.push({ source: '/t/:path*', destination: `${qrDineinUrl}/t/:path*` });
    }
    if (kioskUrl) {
      rules.push({ source: '/kiosk/:path*', destination: `${kioskUrl}/kiosk/:path*` });
    }
    return rules;
  },
  // Workspace packages are consumed source-direct (TypeScript), so Next must
  // transpile them as part of its build.
  transpilePackages: [
    '@menukaze/db',
    '@menukaze/monitoring',
    '@menukaze/realtime',
    '@menukaze/shared',
    '@menukaze/tenant',
    '@menukaze/ui',
  ],
  // Mongoose needs the Node runtime, not Edge — exclude from server bundling.
  serverExternalPackages: ['mongoose'],
};

export default config;
