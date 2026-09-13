"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ed25519ReleaseManifestVerifier = exports.Ed25519ReleaseManifestSigner = exports.sha256Hex = exports.ReleaseManifestMismatchError = exports.ArtifactChecksumError = exports.ReleaseManifestSignatureError = exports.ReleaseManifestError = exports.RELEASE_MANIFEST_VERSION = void 0;
exports.decodeReleaseManifest = decodeReleaseManifest;
exports.assertManifestMatchesRelease = assertManifestMatchesRelease;
exports.findManifestComponent = findManifestComponent;
exports.assertComponentDigest = assertComponentDigest;
const node_crypto_1 = require("node:crypto");
const pem_1 = require("./pem");
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
exports.RELEASE_MANIFEST_VERSION = 1;
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
class ReleaseManifestError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ReleaseManifestError';
    }
}
exports.ReleaseManifestError = ReleaseManifestError;
/** The manifest did not verify against the configured public key. */
class ReleaseManifestSignatureError extends ReleaseManifestError {
    constructor(message = 'release manifest signature verification failed') {
        super(message);
        this.name = 'ReleaseManifestSignatureError';
    }
}
exports.ReleaseManifestSignatureError = ReleaseManifestSignatureError;
/** A downloaded artifact does not match what the signed manifest promised. */
class ArtifactChecksumError extends ReleaseManifestError {
    constructor(component, expected, actual) {
        super(`artifact for "${component}" does not match the signed manifest (expected sha256 ${expected}, got ${actual})`);
        this.component = component;
        this.expected = expected;
        this.actual = actual;
        this.name = 'ArtifactChecksumError';
    }
}
exports.ArtifactChecksumError = ArtifactChecksumError;
/** The manifest describes a different release than the one being applied. */
class ReleaseManifestMismatchError extends ReleaseManifestError {
    constructor(field, expected, actual) {
        super(`release manifest ${field} mismatch: expected ${expected}, got ${actual}`);
        this.name = 'ReleaseManifestMismatchError';
    }
}
exports.ReleaseManifestMismatchError = ReleaseManifestMismatchError;
/** Lowercase hex SHA-256, the form every digest in a manifest takes. */
const sha256Hex = (bytes) => (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
exports.sha256Hex = sha256Hex;
/** Decode the payload segment without checking the signature. */
function decodeReleaseManifest(token) {
    const payload = token.split('.')[0];
    if (!payload)
        throw new ReleaseManifestError('malformed release manifest');
    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    }
    catch {
        throw new ReleaseManifestError('malformed release manifest');
    }
}
/** Signs a release manifest (CMS side). Mirrors `Ed25519LicenseSigner`. */
class Ed25519ReleaseManifestSigner {
    /** Falls back to `process.env.LICENSE_PRIVATE_KEY_PEM` when omitted. */
    constructor(privateKeyPem) {
        const pem = (0, pem_1.normalizePem)(privateKeyPem?.trim() ? privateKeyPem : (0, pem_1.readEnv)('LICENSE_PRIVATE_KEY_PEM'));
        if (!pem) {
            throw new ReleaseManifestError('license-core: privateKeyPem is required');
        }
        this.key = (0, node_crypto_1.createPrivateKey)(pem);
        if (this.key.asymmetricKeyType !== 'ed25519') {
            throw new ReleaseManifestError('license-core: privateKeyPem must be an Ed25519 key');
        }
    }
    sign(claims) {
        const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
        const sig = (0, node_crypto_1.sign)(null, signedBytes(payload), this.key);
        return `${payload}.${sig.toString('base64url')}`;
    }
}
exports.Ed25519ReleaseManifestSigner = Ed25519ReleaseManifestSigner;
/** Verifies a release manifest (installation side). */
class Ed25519ReleaseManifestVerifier {
    /** Falls back to `process.env.LICENSE_PUBLIC_KEY` when omitted. */
    constructor(publicKeyPem) {
        const pem = (0, pem_1.normalizePem)(publicKeyPem?.trim() ? publicKeyPem : (0, pem_1.readEnv)('LICENSE_PUBLIC_KEY'));
        if (!pem) {
            throw new ReleaseManifestError('license-core: publicKeyPem is required');
        }
        this.key = (0, node_crypto_1.createPublicKey)(pem);
        if (this.key.asymmetricKeyType !== 'ed25519') {
            throw new ReleaseManifestError('license-core: publicKeyPem must be an Ed25519 key');
        }
    }
    verify(token) {
        const [payload, sig] = token.split('.');
        if (!payload || !sig) {
            throw new ReleaseManifestError('malformed release manifest');
        }
        let ok = false;
        try {
            ok = (0, node_crypto_1.verify)(null, signedBytes(payload), this.key, Buffer.from(sig, 'base64url'));
        }
        catch {
            ok = false;
        }
        if (!ok)
            throw new ReleaseManifestSignatureError();
        const claims = decodeReleaseManifest(token);
        if (claims.v !== exports.RELEASE_MANIFEST_VERSION) {
            throw new ReleaseManifestError(`unsupported release manifest version ${String(claims.v)}`);
        }
        return claims;
    }
}
exports.Ed25519ReleaseManifestVerifier = Ed25519ReleaseManifestVerifier;
/**
 * Asserts a verified manifest describes the release being applied. Guards the
 * case where the CMS is honest but answers about the wrong release — a race
 * with a concurrent publish, or a client that mixed up two jobs.
 */
function assertManifestMatchesRelease(manifest, releaseId) {
    if (manifest.releaseId !== releaseId) {
        throw new ReleaseManifestMismatchError('releaseId', releaseId, manifest.releaseId);
    }
}
/** The manifest entry for one component, or throws if the release has none. */
function findManifestComponent(manifest, component) {
    const found = manifest.components.find((c) => c.component === component);
    if (!found) {
        throw new ReleaseManifestError(`release manifest has no component "${component}"`);
    }
    return found;
}
/**
 * Checks a downloaded artifact against the signed manifest. Size is compared
 * too, so a truncated download fails here rather than as a confusing unpack
 * error three steps later.
 */
function assertComponentDigest(expected, actual) {
    if (actual.sha256.toLowerCase() !== expected.sha256.toLowerCase()) {
        throw new ArtifactChecksumError(expected.component, expected.sha256, actual.sha256);
    }
    if (actual.sizeBytes !== expected.sizeBytes) {
        throw new ArtifactChecksumError(expected.component, `${expected.sizeBytes} bytes`, `${actual.sizeBytes} bytes`);
    }
}
function signedBytes(payload) {
    return Buffer.from(MANIFEST_CONTEXT + payload, 'utf8');
}
