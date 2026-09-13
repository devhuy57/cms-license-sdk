/// <reference types="jest" />
import { generateKeyPairSync } from 'node:crypto';
import {
  ArtifactChecksumError,
  assertComponentDigest,
  assertManifestMatchesRelease,
  buildLicenseTokenClaims,
  decodeReleaseManifest,
  Ed25519LicenseSigner,
  Ed25519ReleaseManifestSigner,
  Ed25519ReleaseManifestVerifier,
  findManifestComponent,
  RELEASE_MANIFEST_VERSION,
  ReleaseManifestError,
  ReleaseManifestMismatchError,
  ReleaseManifestSignatureError,
  sha256Hex,
  type ReleaseManifestClaims,
} from './index';

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function manifest(
  overrides: Partial<ReleaseManifestClaims> = {},
): ReleaseManifestClaims {
  return {
    v: RELEASE_MANIFEST_VERSION,
    releaseId: 'rel-1',
    productId: 'nguonvia',
    version: '1.3.0',
    channel: 'stable',
    gitRef: null,
    minUpgradableFrom: null,
    components: [
      {
        component: 'api',
        componentVersion: '1.3.0',
        sha256: 'a'.repeat(64),
        sizeBytes: 1024,
        migrationRequired: true,
      },
    ],
    iat: 1_790_000_000,
    ...overrides,
  };
}

describe('release manifest signing', () => {
  it('round-trips claims through sign/verify', () => {
    const { privateKeyPem, publicKeyPem } = keypair();
    const token = new Ed25519ReleaseManifestSigner(privateKeyPem).sign(
      manifest(),
    );

    const claims = new Ed25519ReleaseManifestVerifier(publicKeyPem).verify(
      token,
    );

    expect(claims.releaseId).toBe('rel-1');
    expect(claims.components[0].sha256).toBe('a'.repeat(64));
  });

  it('accepts a base64-of-PEM public key, as env vars carry it', () => {
    const { privateKeyPem, publicKeyPem } = keypair();
    const token = new Ed25519ReleaseManifestSigner(privateKeyPem).sign(
      manifest(),
    );
    const b64 = Buffer.from(publicKeyPem, 'utf8').toString('base64');

    expect(() =>
      new Ed25519ReleaseManifestVerifier(b64).verify(token),
    ).not.toThrow();
  });

  it('rejects a tampered payload', () => {
    const { privateKeyPem, publicKeyPem } = keypair();
    const token = new Ed25519ReleaseManifestSigner(privateKeyPem).sign(
      manifest(),
    );
    const [, sig] = token.split('.');
    // Swap in a digest of the attacker's own tarball, keeping the signature.
    const forged = Buffer.from(
      JSON.stringify(manifest({ components: [{ ...manifest().components[0], sha256: 'b'.repeat(64) }] })),
      'utf8',
    ).toString('base64url');

    expect(() =>
      new Ed25519ReleaseManifestVerifier(publicKeyPem).verify(
        `${forged}.${sig}`,
      ),
    ).toThrow(ReleaseManifestSignatureError);
  });

  it('rejects a manifest signed by a different key', () => {
    const signer = keypair();
    const other = keypair();
    const token = new Ed25519ReleaseManifestSigner(signer.privateKeyPem).sign(
      manifest(),
    );

    expect(() =>
      new Ed25519ReleaseManifestVerifier(other.publicKeyPem).verify(token),
    ).toThrow(ReleaseManifestSignatureError);
  });

  it('rejects a LICENSE token presented as a manifest', () => {
    // Domain separation. The two token types share a key and a wire format,
    // so without the context prefix this signature would verify and only the
    // claim shape would be left to notice.
    const { privateKeyPem, publicKeyPem } = keypair();
    const licenseToken = new Ed25519LicenseSigner(privateKeyPem).sign(
      buildLicenseTokenClaims({
        key: 'KEY-1',
        productId: 'nguonvia',
        status: 'active',
        issuedAt: new Date(),
        tokenTtlSeconds: 86_400,
        graceSeconds: 1_296_000,
        features: ['core'],
        secretSalt: 'salt',
      }),
    );

    expect(() =>
      new Ed25519ReleaseManifestVerifier(publicKeyPem).verify(licenseToken),
    ).toThrow(ReleaseManifestSignatureError);
  });

  it('rejects a malformed token without throwing something unrecognizable', () => {
    const { publicKeyPem } = keypair();
    const verifier = new Ed25519ReleaseManifestVerifier(publicKeyPem);

    expect(() => verifier.verify('not-a-token')).toThrow(ReleaseManifestError);
    expect(() => decodeReleaseManifest('%%%.%%%')).toThrow(
      ReleaseManifestError,
    );
  });

  it('rejects an unsupported manifest version even when the signature is good', () => {
    const { privateKeyPem, publicKeyPem } = keypair();
    const token = new Ed25519ReleaseManifestSigner(privateKeyPem).sign(
      manifest({ v: 99 }),
    );

    expect(() =>
      new Ed25519ReleaseManifestVerifier(publicKeyPem).verify(token),
    ).toThrow('unsupported release manifest version 99');
  });
});

describe('manifest checks against downloaded artifacts', () => {
  it('accepts an artifact matching the signed digest and size', () => {
    const bytes = Buffer.from('tarball');
    const entry = {
      component: 'api',
      componentVersion: '1.3.0',
      sha256: sha256Hex(bytes),
      sizeBytes: bytes.length,
      migrationRequired: false,
    };

    expect(() =>
      assertComponentDigest(entry, {
        sha256: sha256Hex(bytes),
        sizeBytes: bytes.length,
      }),
    ).not.toThrow();
  });

  it('rejects a substituted artifact', () => {
    const entry = manifest().components[0];

    expect(() =>
      assertComponentDigest(entry, { sha256: 'b'.repeat(64), sizeBytes: 1024 }),
    ).toThrow(ArtifactChecksumError);
  });

  it('rejects a truncated download, rather than failing later at unpack', () => {
    const entry = manifest().components[0];

    expect(() =>
      assertComponentDigest(entry, { sha256: entry.sha256, sizeBytes: 512 }),
    ).toThrow(ArtifactChecksumError);
  });

  it('rejects a manifest describing a different release', () => {
    expect(() => assertManifestMatchesRelease(manifest(), 'rel-1')).not.toThrow();
    expect(() => assertManifestMatchesRelease(manifest(), 'rel-2')).toThrow(
      ReleaseManifestMismatchError,
    );
  });

  it('names the component when the release has no such part', () => {
    expect(findManifestComponent(manifest(), 'api').componentVersion).toBe(
      '1.3.0',
    );
    expect(() => findManifestComponent(manifest(), 'admin')).toThrow(
      'no component "admin"',
    );
  });
});
