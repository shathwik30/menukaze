import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readEncryptionEnv } from './env';

/**
 * Envelope encryption for per-tenant secrets (Razorpay keys, webhook
 * secrets, etc.) stored in MongoDB.
 *
 * - Algorithm: AES-256-GCM (authenticated encryption, no separate HMAC needed)
 * - Key: 32 bytes derived from the base64 `ENCRYPTION_KEY` env var
 * - Each call uses a fresh 12-byte IV (standard GCM nonce size)
 * - Ciphertext carries a 16-byte auth tag that the decrypt call verifies
 *
 * Encoded string layout (single column-safe string):
 *
 *     v1:<base64 iv>:<base64 ciphertext>:<base64 auth tag>
 *
 * The `v1` prefix lets us rotate algorithms later (`v2:…`, `v3:…`) without
 * losing access to existing ciphertexts. The decrypt function rejects any
 * unknown version.
 */

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

function getKey(): Buffer {
  const b64 = readEncryptionEnv().ENCRYPTION_KEY;
  if (!b64) {
    throw new Error('envelope-crypto: missing ENCRYPTION_KEY env var');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `envelope-crypto: ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes ` +
        `(got ${key.length}). Generate with: openssl rand -base64 32`,
    );
  }
  return key;
}

/**
 * Encrypt a UTF-8 string and return a single `v1:iv:ciphertext:tag` encoded
 * value suitable for storing in a MongoDB string field.
 */
export function envelopeEncrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${ciphertext.toString('base64')}:${authTag.toString(
    'base64',
  )}`;
}

/**
 * Decrypt an envelope-encoded value. Throws if:
 * - The version prefix is unknown
 * - The ENCRYPTION_KEY is missing or the wrong length
 * - The ciphertext is tampered (GCM auth tag mismatch)
 * - The input is malformed
 */
export function envelopeDecrypt(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 4) {
    throw new Error('envelope-crypto: malformed input — expected 4 colon-separated segments');
  }
  const [version, ivB64, ctB64, tagB64] = parts;
  if (version !== VERSION) {
    throw new Error(`envelope-crypto: unsupported version "${version}"`);
  }
  if (!ivB64 || !ctB64 || !tagB64) {
    throw new Error('envelope-crypto: malformed input — empty segment');
  }
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
