import { generateKeyPairSync } from 'node:crypto';
import {
  buildLicenseTokenClaims,
  Ed25519LicenseSigner,
  Ed25519LicenseVerifier,
  hashLicenseKey,
} from './index';

describe('license-sdk/core', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  const claims = buildLicenseTokenClaims({
    key: 'AAAA-BBBB',
    productId: 'prod-1',
    status: 'active',
    boundDomain: 'acme.com',
    issuedAt: new Date('2026-06-01T00:00:00Z'),
    tokenTtlSeconds: 3600,
    graceSeconds: 7200,
    features: ['core'],
    secretSalt: 'salt',
  });

  it('builds claims with hashed sub, derived exp/grace and secret', () => {
    expect(claims.sub).toBe(hashLicenseKey('AAAA-BBBB'));
    expect(claims.exp).toBe(claims.iat + 3600);
    expect(claims.graceUntil).toBe(claims.iat + 7200);
    expect(claims.secret).toHaveLength(43);
  });

  it('signs and verifies a round-trip token', () => {
    const token = new Ed25519LicenseSigner(priv).sign(claims);
    const decoded = new Ed25519LicenseVerifier(pub).verify(token);
    expect(decoded.productId).toBe('prod-1');
    expect(decoded.boundDomain).toBe('acme.com');
  });

  it('rejects a non-Ed25519 key', () => {
    const { privateKey: rsa } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    expect(
      () =>
        new Ed25519LicenseSigner(
          rsa.export({ type: 'pkcs8', format: 'pem' }).toString(),
        ),
    ).toThrow(/ed25519/i);
  });

  it('fails verification on a tampered payload', () => {
    const token = new Ed25519LicenseSigner(priv).sign(claims);
    const [, sig] = token.split('.');
    const forged =
      Buffer.from(JSON.stringify({ ...claims, features: ['core', 'pro'] })).toString(
        'base64url',
      ) +
      '.' +
      sig;
    expect(() => new Ed25519LicenseVerifier(pub).verify(forged)).toThrow(
      /signature/i,
    );
  });

  it('verifier accepts base64-of-PEM public key', () => {
    const b64 = Buffer.from(pub, 'utf8').toString('base64');
    const token = new Ed25519LicenseSigner(priv).sign(claims);
    expect(new Ed25519LicenseVerifier(b64).verify(token).productId).toBe(
      'prod-1',
    );
  });
});
