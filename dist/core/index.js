"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ed25519LicenseVerifier = exports.Ed25519LicenseSigner = exports.isLicenseExpired = exports.isWithinGrace = exports.isTokenFresh = exports.deriveRuntimeSecret = exports.hashLicenseKey = exports.LICENSE_TOKEN_VERSION = exports.normalizePem = void 0;
exports.buildLicenseTokenClaims = buildLicenseTokenClaims;
exports.decodeLicenseTokenPayload = decodeLicenseTokenPayload;
const node_crypto_1 = require("node:crypto");
const pem_1 = require("./pem");
var pem_2 = require("./pem");
Object.defineProperty(exports, "normalizePem", { enumerable: true, get: function () { return pem_2.normalizePem; } });
__exportStar(require("./release-manifest"), exports);
/**
 * Shared license-token contract + Node crypto. Used by the license SERVER (to
 * sign) and by Node BACKENDS (to verify). A token is
 * `base64url(claimsJSON).base64url(ed25519Signature)`; the signature is over the
 * payload segment bytes. The raw license key never travels in the token — only
 * its SHA-256 (`sub`).
 */
exports.LICENSE_TOKEN_VERSION = 1;
const hashLicenseKey = (key) => (0, node_crypto_1.createHash)('sha256').update(key).digest('hex');
exports.hashLicenseKey = hashLicenseKey;
const deriveRuntimeSecret = (salt, key) => (0, node_crypto_1.createHmac)('sha256', salt).update(key).digest('base64url');
exports.deriveRuntimeSecret = deriveRuntimeSecret;
function buildLicenseTokenClaims(input) {
    const iat = Math.floor(input.issuedAt.getTime() / 1000);
    return {
        v: exports.LICENSE_TOKEN_VERSION,
        sub: (0, exports.hashLicenseKey)(input.key),
        productId: input.productId,
        planId: input.planId ?? null,
        status: input.status,
        boundIp: input.boundIp ?? null,
        boundDomain: input.boundDomain ?? null,
        licenseExpiresAt: input.licenseExpiresAt ?? null,
        iat,
        exp: iat + input.tokenTtlSeconds,
        graceUntil: iat + input.graceSeconds,
        features: input.features,
        secret: (0, exports.deriveRuntimeSecret)(input.secretSalt, input.key),
    };
}
/** Decode the base64url payload segment (no signature check). */
function decodeLicenseTokenPayload(token) {
    const payload = token.split('.')[0];
    if (!payload)
        throw new Error('malformed token');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}
const isTokenFresh = (claims, nowSec) => nowSec < claims.exp;
exports.isTokenFresh = isTokenFresh;
const isWithinGrace = (claims, nowSec) => nowSec < claims.graceUntil;
exports.isWithinGrace = isWithinGrace;
const isLicenseExpired = (claims, now) => claims.licenseExpiresAt !== null &&
    new Date(claims.licenseExpiresAt).getTime() <= now.getTime();
exports.isLicenseExpired = isLicenseExpired;
/**
 * Ed25519 signer (license server). Construct with the PRIVATE key PEM (pkcs8);
 * `sign()` returns a `payload.signature` token. Throws if the key is not Ed25519.
 */
class Ed25519LicenseSigner {
    /** Falls back to `process.env.LICENSE_PRIVATE_KEY_PEM` when omitted. */
    constructor(privateKeyPem) {
        const pem = (0, pem_1.normalizePem)(privateKeyPem?.trim() ? privateKeyPem : (0, pem_1.readEnv)('LICENSE_PRIVATE_KEY_PEM'));
        if (!pem)
            throw new Error('license-core: privateKeyPem is required');
        this.key = (0, node_crypto_1.createPrivateKey)(pem);
        if (this.key.asymmetricKeyType !== 'ed25519') {
            throw new Error('license-core: privateKeyPem must be an Ed25519 key');
        }
    }
    sign(claims) {
        const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
        const sig = (0, node_crypto_1.sign)(null, Buffer.from(payload), this.key);
        return `${payload}.${sig.toString('base64url')}`;
    }
}
exports.Ed25519LicenseSigner = Ed25519LicenseSigner;
/**
 * Ed25519 verifier for Node backends. Construct with the PUBLIC key (SPKI PEM or
 * base64 of it). `verify()` returns the claims or throws on malformed/bad-sig.
 */
class Ed25519LicenseVerifier {
    /** Falls back to `process.env.LICENSE_PUBLIC_KEY` when omitted. */
    constructor(publicKeyPem) {
        const pem = (0, pem_1.normalizePem)(publicKeyPem?.trim() ? publicKeyPem : (0, pem_1.readEnv)('LICENSE_PUBLIC_KEY'));
        if (!pem)
            throw new Error('license-core: publicKeyPem is required');
        this.key = (0, node_crypto_1.createPublicKey)(pem);
        if (this.key.asymmetricKeyType !== 'ed25519') {
            throw new Error('license-core: publicKeyPem must be an Ed25519 key');
        }
    }
    verify(token) {
        const [payload, sig] = token.split('.');
        if (!payload || !sig)
            throw new Error('malformed token');
        const ok = (0, node_crypto_1.verify)(null, Buffer.from(payload), this.key, Buffer.from(sig, 'base64url'));
        if (!ok)
            throw new Error('signature verification failed');
        return decodeLicenseTokenPayload(token);
    }
}
exports.Ed25519LicenseVerifier = Ed25519LicenseVerifier;
