import { describe, expect, it } from 'vitest';
import { normalizeHost, parseHost } from './host';

describe('normalizeHost', () => {
  it('lowercases and strips port', () => {
    expect(normalizeHost('JOES.MENUKAZE.COM:443')).toBe('joes.menukaze.com');
  });
  it('handles missing port', () => {
    expect(normalizeHost('joes.menukaze.com')).toBe('joes.menukaze.com');
  });
});

describe('parseHost', () => {
  it('detects an apex domain', () => {
    expect(parseHost('menukaze.com')).toEqual({ kind: 'apex' });
    expect(parseHost('localhost')).toEqual({ kind: 'apex' });
  });

  it('detects reserved subdomains', () => {
    expect(parseHost('admin.menukaze.com')).toEqual({ kind: 'reserved', subdomain: 'admin' });
    expect(parseHost('api.menukaze.com')).toEqual({ kind: 'reserved', subdomain: 'api' });
    expect(parseHost('sandbox-api.menukaze.com')).toEqual({
      kind: 'reserved',
      subdomain: 'sandbox-api',
    });
  });

  it('detects tenant subdomains', () => {
    expect(parseHost('joes-pizza.menukaze.com')).toEqual({
      kind: 'subdomain',
      slug: 'joes-pizza',
    });
  });

  it('detects local dev tenant subdomains', () => {
    expect(parseHost('demo.localhost.menukaze.dev:3001')).toEqual({
      kind: 'subdomain',
      slug: 'demo',
    });
  });

  it('treats unknown domains as custom', () => {
    expect(parseHost('orders.joespizza.com')).toEqual({
      kind: 'custom',
      host: 'orders.joespizza.com',
    });
  });

  it('returns invalid for empty input', () => {
    expect(parseHost(null)).toEqual({ kind: 'invalid' });
    expect(parseHost('')).toEqual({ kind: 'invalid' });
  });
});
