import { generateKeyPairSync } from 'node:crypto';
import { Ed25519LicenseSigner, buildLicenseTokenClaims } from '../core';
import { verifyLicenseToken } from './index';

// Node 18+ exposes Web Crypto as global `crypto`, matching the edge runtime the
// SDK targets — so this exercises the exact code path used in the browser/edge.
describe('license-sdk/edge', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  const token = new Ed25519LicenseSigner(priv).sign(
    buildLicenseTokenClaims({
      key: 'K-1',
      productId: 'prod-1',
      status: 'active',
      issuedAt: new Date(),
      tokenTtlSeconds: 3600,
      graceSeconds: 7200,
      features: ['core'],
      secretSalt: 'salt',
    }),
  );

  it('verifies a core-signed token via Web Crypto', async () => {
    const claims = await verifyLicenseToken(token, pub);
    expect(claims?.productId).toBe('prod-1');
  });

  it('accepts base64-of-PEM public key', async () => {
    const b64 = Buffer.from(pub, 'utf8').toString('base64');
    expect((await verifyLicenseToken(token, b64))?.productId).toBe('prod-1');
  });

  it('returns null for a tampered payload', async () => {
    const [payload, sig] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ tampered: true }),
    ).toString('base64url');
    expect(await verifyLicenseToken(`${forgedPayload}.${sig}`, pub)).toBeNull();
    expect(payload).toBeTruthy();
  });

  it('returns null for a malformed token', async () => {
    expect(await verifyLicenseToken('nope', pub)).toBeNull();
  });

  it('falls back to NEXT_PUBLIC_LICENSE_PUBLIC_KEY when no key is passed', async () => {
    const prev = process.env.NEXT_PUBLIC_LICENSE_PUBLIC_KEY;
    process.env.NEXT_PUBLIC_LICENSE_PUBLIC_KEY = pub;
    try {
      expect((await verifyLicenseToken(token))?.productId).toBe('prod-1');
    } finally {
      process.env.NEXT_PUBLIC_LICENSE_PUBLIC_KEY = prev;
    }
  });
});
