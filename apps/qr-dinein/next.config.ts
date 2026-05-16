import type { NextConfig } from 'next';

const assetPrefix =
  process.env['NEXT_PUBLIC_QR_DINEIN_ASSET_URL'] ?? 'https://menukaze-qr-dinein.vercel.app';

const config: NextConfig = {
  reactStrictMode: true,
  assetPrefix,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  transpilePackages: [
    '@menukaze/db',
    '@menukaze/monitoring',
    '@menukaze/realtime',
    '@menukaze/shared',
    '@menukaze/tenant',
    '@menukaze/ui',
  ],
  serverExternalPackages: ['mongoose'],
};

export default config;
