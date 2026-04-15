import { createTenantMiddleware } from '@menukaze/tenant/middleware';

/**
 * Super-admin isn't tenant-scoped (no host parsing) and has no third-party
 * script needs (no Razorpay/Ably), so the CSP is tighter than the other apps.
 */
export const { middleware, config } = createTenantMiddleware({
  parseTenant: false,
  csp: {
    'default-src': "'self'",
    'script-src': "'self' 'nonce-{nonce}' 'strict-dynamic'",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob:",
    'font-src': "'self' data:",
    'connect-src': "'self'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'frame-ancestors': "'none'",
    'upgrade-insecure-requests': '',
  },
});
