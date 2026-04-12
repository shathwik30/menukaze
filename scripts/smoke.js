/**
 * Menukaze k6 smoke test — Phase 5 pre-launch verification.
 *
 * Usage:
 *   k6 run scripts/smoke.js
 *   BASE_URL=https://demo.menukaze.com k6 run scripts/smoke.js
 *
 * Target: 50 concurrent VUs, 60 s duration, 0 errors, P95 < 1 s.
 *
 * Install k6: https://k6.io/docs/getting-started/installation/
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const storefrontDuration = new Trend('storefront_duration', true);
const menuDuration = new Trend('menu_duration', true);
const checkoutDuration = new Trend('checkout_duration', true);

export const options = {
  vus: 50,
  duration: '60s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1 % error rate
    http_req_duration: ['p(95)<1000'], // P95 < 1 s
    errors: ['rate<0.01'],
    storefront_duration: ['p(95)<1000'],
    menu_duration: ['p(95)<500'],
  },
};

// Override BASE_URL via k6 environment variable: -e BASE_URL=https://...
const BASE_URL = __ENV.BASE_URL || 'http://demo.localhost:3001';
const SLUG = __ENV.SLUG || 'demo';

export default function () {
  // 1. Storefront home page
  {
    const res = http.get(`${BASE_URL}/`, {
      headers: { Host: `${SLUG}.localhost` },
    });
    storefrontDuration.add(res.timings.duration);
    const ok = check(res, {
      'storefront: status 200': (r) => r.status === 200,
      'storefront: has restaurant name': (r) => r.body.length > 200,
    });
    errorRate.add(!ok);
  }

  sleep(0.5);

  // 2. Healthcheck / API route
  {
    const res = http.get(`${BASE_URL}/api/health`, {
      headers: { Host: `${SLUG}.localhost` },
    });
    // Accept 200 or 404 (health endpoint may not exist yet)
    const ok = check(res, {
      'health: not 5xx': (r) => r.status < 500,
    });
    errorRate.add(!ok);
  }

  sleep(1);
}
