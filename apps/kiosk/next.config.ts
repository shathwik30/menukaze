import type { NextConfig } from 'next';

// When accessed through the storefront proxy (mr-beast.menukaze.com/kiosk),
// static assets must load from 'self' to pass the storefront's CSP.
// The storefront rewrites /kiosk-assets/* → kiosk's own _next/* assets.
const assetPrefix = '/kiosk-assets';

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
