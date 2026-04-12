import Razorpay from 'razorpay';

export interface EncryptedRazorpayCredentials {
  razorpayKeyIdEnc?: string | null;
  razorpayKeySecretEnc?: string | null;
}

export interface RazorpayClientBundle {
  client: Razorpay;
  keyId: string;
  keySecret: string;
}

export function getRazorpayClientFromEncryptedKeys(
  credentials: EncryptedRazorpayCredentials,
  decrypt: (value: string) => string,
): RazorpayClientBundle | null {
  const keyIdEnc = credentials.razorpayKeyIdEnc;
  const keySecretEnc = credentials.razorpayKeySecretEnc;

  if (!keyIdEnc || !keySecretEnc) return null;

  const keyId = decrypt(keyIdEnc);
  const keySecret = decrypt(keySecretEnc);

  return {
    client: new Razorpay({ key_id: keyId, key_secret: keySecret }),
    keyId,
    keySecret,
  };
}
