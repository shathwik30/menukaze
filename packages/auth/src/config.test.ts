import { describe, expect, it } from 'vitest';
import { createAuth } from './config';

describe('createAuth', () => {
  it('is an async function', () => {
    expect(typeof createAuth).toBe('function');
    // Calling createAuth without env vars throws synchronously inside readEnv,
    // which is the contract — fail fast at boot, not at first request.
    return expect(createAuth()).rejects.toThrow(/Missing required env var/);
  });
});
