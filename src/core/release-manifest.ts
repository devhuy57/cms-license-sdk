import {
  createHash,
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { normalizePem, readEnv } from './pem';

/**
 * The signed inventory of what a release actually contains. Signed by the CMS
 * with the same Ed25519 key as the license token, verified by an installation
 * before it extracts a single byte.
 *
 * Why this exists at all: an installation that auto-applies updates will
 * unpack whatever the CMS tells it to, over its own source tree, and then run
 * it. Without a signature, anyone who can impersonate the CMS — a forged DNS
 * answer, a compromised proxy, a customer who repointed `authorityUrl` at
 * their own box — chooses what code runs on that server. A SHA-256 alone does
 * not help: it comes down the same wire as the bytes it vouches for.
 */
export const RELEASE_MANIFEST_VERSION = 1 as const;

/**
 * Domain separation. The signature covers `MANIFEST_CONTEXT + payload`, not
 * the bare payload the license token signs.
 *
 * Without this prefix, one key would produce signatures valid under both
 * readers, so a license token could be presented as a manifest (or the
 * reverse) and the signature check would pass — leaving only the claim shapes
 * to notice. That is a cheap mistake to rule out entirely rather than argue
 * about.
 */
const MANIFEST_CONTEXT = 'cmsnt.release-manifest.v1.';

export interface ReleaseManifestComponent {
  /** Deployable part, e.g. `api`, `admin`, `storefront`. */
  component: string;
  componentVersion: string;
  /** Lowercase hex SHA-256 of the source artifact bytes. */
  sha256: string;
  sizeBytes: number;
  migrationRequired: boolean;
}

export interface ReleaseManifestClaims {
  v: number;
  releaseId: string;
  /** Product slug, matching the license token's `productId`. */
  productId: string;
  version: string;
  channel: string;
  gitRef: string | null;
  minUpgradableFrom: string | null;
  components: ReleaseManifestComponent[];
  /** Issued-at, unix seconds. */
  iat: number;
}

export class ReleaseManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseManifestError';
  }
}

/** The manifest did not verify against the configured public key. */
export class ReleaseManifestSignatureError extends ReleaseManifestError {
  constructor(message = 'release manifest signature verification failed') {
    super(message);
    this.name = 'ReleaseManifestSignatureError';
  }
}

/** A downloaded artifact does not match what the signed manifest promised. */
export class ArtifactChecksumError extends ReleaseManifestError {
  constructor(
    readonly component: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `artifact for "${component}" does not match the signed manifest (expected sha256 ${expected}, got ${actual})`,
    );
    this.name = 'ArtifactChecksumError';
  }
}

/** The manifest describes a different release than the one being applied. */
export class ReleaseManifestMismatchError extends ReleaseManifestError {
  constructor(field: string, expected: string, actual: string) {
    super(
      `release manifest ${field} mismatch: expected ${expected}, got ${actual}`,
    );
    this.name = 'ReleaseManifestMismatchError';
  }
}

/** Lowercase hex SHA-256, the form every digest in a manifest takes. */
export const sha256Hex = (bytes: Buffer | Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

/** Decode the payload segment without checking the signature. */
export function decodeReleaseManifest(token: string): ReleaseManifestClaims {
  const payload = token.split('.')[0];
  if (!payload) throw new ReleaseManifestError('malformed release manifest');
  try {
    return JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as ReleaseManifestClaims;
  } catch {
    throw new ReleaseManifestError('malformed release manifest');
  }
}

/** Signs a release manifest (CMS side). Mirrors `Ed25519LicenseSigner`. */
export class Ed25519ReleaseManifestSigner {
  private readonly key: KeyObject;

  /** Falls back to `process.env.LICENSE_PRIVATE_KEY_PEM` when omitted. */
  constructor(privateKeyPem?: string) {
    const pem = normalizePem(
      privateKeyPem?.trim() ? privateKeyPem : readEnv('LICENSE_PRIVATE_KEY_PEM'),
    );
    if (!pem) {
      throw new ReleaseManifestError('license-core: privateKeyPem is required');
    }
    this.key = createPrivateKey(pem);
    if (this.key.asymmetricKeyType !== 'ed25519') {
      throw new ReleaseManifestError(
        'license-core: privateKeyPem must be an Ed25519 key',
      );
    }
  }

  sign(claims: ReleaseManifestClaims): string {
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString(
      'base64url',
    );
    const sig = cryptoSign(null, signedBytes(payload), this.key);
    return `${payload}.${sig.toString('base64url')}`;
  }
}

/** Verifies a release manifest (installation side). */
export class Ed25519ReleaseManifestVerifier {
  private readonly key: KeyObject;

  /** Falls back to `process.env.LICENSE_PUBLIC_KEY` when omitted. */
  constructor(publicKeyPem?: string) {
    const pem = normalizePem(
      publicKeyPem?.trim() ? publicKeyPem : readEnv('LICENSE_PUBLIC_KEY'),
    );
    if (!pem) {
      throw new ReleaseManifestError('license-core: publicKeyPem is required');
    }
    this.key = createPublicKey(pem);
    if (this.key.asymmetricKeyType !== 'ed25519') {
      throw new ReleaseManifestError(
        'license-core: publicKeyPem must be an Ed25519 key',
      );
    }
  }

  verify(token: string): ReleaseManifestClaims {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) {
      throw new ReleaseManifestError('malformed release manifest');
    }
    let ok = false;
    try {
      ok = cryptoVerify(
        null,
        signedBytes(payload),
        this.key,
        Buffer.from(sig, 'base64url'),
      );
    } catch {
      ok = false;
    }
    if (!ok) throw new ReleaseManifestSignatureError();

    const claims = decodeReleaseManifest(token);
    if (claims.v !== RELEASE_MANIFEST_VERSION) {
      throw new ReleaseManifestError(
        `unsupported release manifest version ${String(claims.v)}`,
      );
    }
    return claims;
  }
}

/**
 * Asserts a verified manifest describes the release being applied. Guards the
 * case where the CMS is honest but answers about the wrong release — a race
 * with a concurrent publish, or a client that mixed up two jobs.
 */
export function assertManifestMatchesRelease(
  manifest: ReleaseManifestClaims,
  releaseId: string,
): void {
  if (manifest.releaseId !== releaseId) {
    throw new ReleaseManifestMismatchError(
      'releaseId',
      releaseId,
      manifest.releaseId,
    );
  }
}

/** The manifest entry for one component, or throws if the release has none. */
export function findManifestComponent(
  manifest: ReleaseManifestClaims,
  component: string,
): ReleaseManifestComponent {
  const found = manifest.components.find((c) => c.component === component);
  if (!found) {
    throw new ReleaseManifestError(
      `release manifest has no component "${component}"`,
    );
  }
  return found;
}

/**
 * Checks a downloaded artifact against the signed manifest. Size is compared
 * too, so a truncated download fails here rather than as a confusing unpack
 * error three steps later.
 */
export function assertComponentDigest(
  expected: ReleaseManifestComponent,
  actual: { sha256: string; sizeBytes: number },
): void {
  if (actual.sha256.toLowerCase() !== expected.sha256.toLowerCase()) {
    throw new ArtifactChecksumError(
      expected.component,
      expected.sha256,
      actual.sha256,
    );
  }
  if (actual.sizeBytes !== expected.sizeBytes) {
    throw new ArtifactChecksumError(
      expected.component,
      `${expected.sizeBytes} bytes`,
      `${actual.sizeBytes} bytes`,
    );
  }
}

function signedBytes(payload: string): Buffer {
  return Buffer.from(MANIFEST_CONTEXT + payload, 'utf8');
}
