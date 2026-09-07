"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSTALLATION_TOKEN_STORE = exports.InstallationUnauthorizedError = exports.InstallationAuthorityUnreachableError = exports.INSTALLATION_AUTHORITY = void 0;
exports.INSTALLATION_AUTHORITY = Symbol('UPDATE_CLIENT_INSTALLATION_AUTHORITY');
class InstallationAuthorityUnreachableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InstallationAuthorityUnreachableError';
    }
}
exports.InstallationAuthorityUnreachableError = InstallationAuthorityUnreachableError;
/** Raised when the CMS rejects the stored installation token (invalid/revoked). */
class InstallationUnauthorizedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InstallationUnauthorizedError';
    }
}
exports.InstallationUnauthorizedError = InstallationUnauthorizedError;
exports.INSTALLATION_TOKEN_STORE = Symbol('UPDATE_CLIENT_INSTALLATION_TOKEN_STORE');
