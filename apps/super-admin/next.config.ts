import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  transpilePackages: [
    '@menukaze/auth',
    '@menukaze/db',
    '@menukaze/monitoring',
    '@menukaze/rbac',
    '@menukaze/shared',
    '@menukaze/tenant',
    '@menukaze/ui',
  ],
  serverExternalPackages: ['mongoose'],
};

export default config;
