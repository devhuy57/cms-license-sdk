"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_CACHE = exports.LicenseAuthorityUnreachableError = exports.LICENSE_AUTHORITY = exports.TOKEN_VERIFIER = void 0;
exports.TOKEN_VERIFIER = Symbol('LICENSE_CLIENT_TOKEN_VERIFIER');
exports.LICENSE_AUTHORITY = Symbol('LICENSE_CLIENT_AUTHORITY');
class LicenseAuthorityUnreachableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LicenseAuthorityUnreachableError';
    }
}
exports.LicenseAuthorityUnreachableError = LicenseAuthorityUnreachableError;
exports.TOKEN_CACHE = Symbol('LICENSE_CLIENT_TOKEN_CACHE');
