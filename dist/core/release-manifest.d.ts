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
export declare const RELEASE_MANIFEST_VERSION: 1;
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
export declare class ReleaseManifestError extends Error {
    constructor(message: string);
}
/** The manifest did not verify against the configured public key. */
export declare class ReleaseManifestSignatureError extends ReleaseManifestError {
    constructor(message?: string);
}
/** A downloaded artifact does not match what the signed manifest promised. */
export declare class ArtifactChecksumError extends ReleaseManifestError {
    readonly component: string;
    readonly expected: string;
    readonly actual: string;
    constructor(component: string, expected: string, actual: string);
}
/** The manifest describes a different release than the one being applied. */
export declare class ReleaseManifestMismatchError extends ReleaseManifestError {
    constructor(field: string, expected: string, actual: string);
}
/** Lowercase hex SHA-256, the form every digest in a manifest takes. */
export declare const sha256Hex: (bytes: Buffer | Uint8Array) => string;
/** Decode the payload segment without checking the signature. */
export declare function decodeReleaseManifest(token: string): ReleaseManifestClaims;
/** Signs a release manifest (CMS side). Mirrors `Ed25519LicenseSigner`. */
export declare class Ed25519ReleaseManifestSigner {
    private readonly key;
    /** Falls back to `process.env.LICENSE_PRIVATE_KEY_PEM` when omitted. */
    constructor(privateKeyPem?: string);
    sign(claims: ReleaseManifestClaims): string;
}
/** Verifies a release manifest (installation side). */
export declare class Ed25519ReleaseManifestVerifier {
    private readonly key;
    /** Falls back to `process.env.LICENSE_PUBLIC_KEY` when omitted. */
    constructor(publicKeyPem?: string);
    verify(token: string): ReleaseManifestClaims;
}
/**
 * Asserts a verified manifest describes the release being applied. Guards the
 * case where the CMS is honest but answers about the wrong release — a race
 * with a concurrent publish, or a client that mixed up two jobs.
 */
export declare function assertManifestMatchesRelease(manifest: ReleaseManifestClaims, releaseId: string): void;
/** The manifest entry for one component, or throws if the release has none. */
export declare function findManifestComponent(manifest: ReleaseManifestClaims, component: string): ReleaseManifestComponent;
/**
 * Checks a downloaded artifact against the signed manifest. Size is compared
 * too, so a truncated download fails here rather than as a confusing unpack
 * error three steps later.
 */
export declare function assertComponentDigest(expected: ReleaseManifestComponent, actual: {
    sha256: string;
    sizeBytes: number;
}): void;
