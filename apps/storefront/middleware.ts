import { createTenantMiddleware } from '@menukaze/tenant/middleware';

export const { middleware, config } = createTenantMiddleware({
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
});
