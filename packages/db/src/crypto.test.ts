import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { envelopeDecrypt, envelopeEncrypt } from './crypto';

const ORIGINAL_KEY = process.env['ENCRYPTION_KEY'];

function setKey(key: string | undefined): void {
  if (key === undefined) delete process.env['ENCRYPTION_KEY'];
  else process.env['ENCRYPTION_KEY'] = key;
}

beforeEach(() => {
  // Use a fresh random 32-byte key for each test.
  setKey(randomBytes(32).toString('base64'));
});

afterEach(() => {
  setKey(ORIGINAL_KEY);
});

describe('envelopeEncrypt / envelopeDecrypt', () => {
  it('round-trips a simple ASCII string', () => {
    const plaintext = 'rzp_test_abcd1234';
    const encoded = envelopeEncrypt(plaintext);
    expect(envelopeDecrypt(encoded)).toBe(plaintext);
  });

  it('round-trips a longer UTF-8 string with non-ASCII characters', () => {
    const plaintext = 'Joes Pizza — 🍕 best in town (你好, مرحبا)';
    const encoded = envelopeEncrypt(plaintext);
    expect(envelopeDecrypt(encoded)).toBe(plaintext);
  });

  it('emits a versioned v1 prefix and 4 colon-separated segments', () => {
    const encoded = envelopeEncrypt('hello');
    const parts = encoded.split(':');
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe('v1');
    // iv is 12 bytes → 16 base64 chars (no padding needed)
    expect(parts[1]?.length).toBeGreaterThanOrEqual(16);
  });

  it('produces a different ciphertext every call for the same plaintext (random IV)', () => {
    const a = envelopeEncrypt('same');
    const b = envelopeEncrypt('same');
    expect(a).not.toBe(b);
  });

  it('rejects an unknown version prefix', () => {
    const encoded = envelopeEncrypt('data');
    const tampered = 'v2' + encoded.slice(2);
    expect(() => envelopeDecrypt(tampered)).toThrow(/unsupported version/);
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', () => {
    const encoded = envelopeEncrypt('sensitive');
    const [v, iv, ct, tag] = encoded.split(':');
    // Flip one char in the ciphertext segment
    const flipped = ct!.startsWith('A') ? 'B' + ct!.slice(1) : 'A' + ct!.slice(1);
    const tampered = [v, iv, flipped, tag].join(':');
    expect(() => envelopeDecrypt(tampered)).toThrow();
  });

  it('rejects a malformed input with missing segments', () => {
    expect(() => envelopeDecrypt('v1:iv:ct')).toThrow(/malformed/);
    expect(() => envelopeDecrypt('nothing')).toThrow(/malformed/);
  });

  it('throws when ENCRYPTION_KEY is missing', () => {
    setKey(undefined);
    expect(() => envelopeEncrypt('x')).toThrow(/missing ENCRYPTION_KEY/);
  });

  it('throws when ENCRYPTION_KEY decodes to the wrong length', () => {
    setKey(Buffer.from('too short').toString('base64'));
    expect(() => envelopeEncrypt('x')).toThrow(/32 bytes/);
  });

  it('two ciphertexts encrypted under different keys do not decrypt with each other', () => {
    const plaintext = 'secret-key';
    const keyA = randomBytes(32).toString('base64');
    const keyB = randomBytes(32).toString('base64');

    setKey(keyA);
    const encodedA = envelopeEncrypt(plaintext);

    setKey(keyB);
    expect(() => envelopeDecrypt(encodedA)).toThrow();
  });
});
