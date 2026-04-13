import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Expose to Edge middleware (runs in a separate runtime from Node)
  env: {
    KIOSK_RESTAURANT_SLUG: process.env['KIOSK_RESTAURANT_SLUG'] ?? '',
    KIOSK_EXIT_PIN: process.env['KIOSK_EXIT_PIN'] ?? '1234',
  },
  transpilePackages: [
    '@menukaze/db',
    '@menukaze/realtime',
    '@menukaze/shared',
    '@menukaze/tenant',
    '@menukaze/ui',
  ],
  serverExternalPackages: ['mongoose'],
};

export default config;
