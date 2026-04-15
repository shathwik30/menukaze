import { createTenantMiddleware } from '@menukaze/tenant/middleware';

/**
 * Kiosk runs on a locked-down tablet; we skip HSTS + X-Frame-Options because
 * the device is typically served from a plain-HTTP kiosk launcher. The CSP is
 * extended to allow Razorpay's checkout/CDN/telemetry hosts.
 */
export const { middleware, config } = createTenantMiddleware({
  hsts: false,
  frameOptions: false,
  cspAppend: {
    'script-src': 'https://checkout.razorpay.com',
    'img-src': 'https://cdn.razorpay.com',
    'connect-src': 'https://lumberjack.razorpay.com',
  },
});
