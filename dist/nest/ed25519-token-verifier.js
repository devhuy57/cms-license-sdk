"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ed25519TokenVerifier = void 0;
const core_1 = require("../core");
/** Adapter over the core Node verifier. Accepts SPKI PEM or base64-of-PEM. */
class Ed25519TokenVerifier {
    constructor(publicKeyPem) {
        this.verifier = new core_1.Ed25519LicenseVerifier(publicKeyPem);
    }
    verify(token) {
        return this.verifier.verify(token);
    }
}
exports.Ed25519TokenVerifier = Ed25519TokenVerifier;
