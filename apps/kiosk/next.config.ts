import type { NextConfig } from 'next';

// When accessed through the storefront proxy (mr-beast.menukaze.com/kiosk),
// the browser would fetch /_next/static/* from the wrong domain. assetPrefix
// forces all static asset URLs to be absolute, pointing at this app's own origin.
const assetPrefix = process.env['NEXT_PUBLIC_KIOSK_ASSET_URL'] ?? '';

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
