"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSTALLED_VERSION_PROVIDER = exports.LICENSE_KEY_SOURCE = exports.INSTALLATION_TOKEN_STORE = exports.UpdateConflictError = exports.InstallationNotFoundError = exports.InstallationForbiddenError = exports.InstallationUnauthorizedError = exports.InstallationAuthorityUnreachableError = exports.INSTALLATION_AUTHORITY = void 0;
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
/**
 * The CMS refused on policy grounds — a lapsed update entitlement, a
 * suspended license, a hostname outside the allowlist. Distinct from
 * `Unauthorized` because re-registering will not help, and distinct from
 * `Unreachable` because it is an answer, not a failure to get one.
 */
class InstallationForbiddenError extends Error {
    constructor(message, code = null) {
        super(message);
        this.code = code;
        this.name = 'InstallationForbiddenError';
    }
}
exports.InstallationForbiddenError = InstallationForbiddenError;
/** The CMS has no such installation/job/release. */
class InstallationNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InstallationNotFoundError';
    }
}
exports.InstallationNotFoundError = InstallationNotFoundError;
/**
 * The CMS refused because of state: an update already in progress, a release
 * that is not published, a job that already finished, an upgrade that skips
 * a required intermediate release.
 */
class UpdateConflictError extends Error {
    constructor(message, code = null) {
        super(message);
        this.code = code;
        this.name = 'UpdateConflictError';
    }
}
exports.UpdateConflictError = UpdateConflictError;
exports.INSTALLATION_TOKEN_STORE = Symbol('UPDATE_CLIENT_INSTALLATION_TOKEN_STORE');
exports.LICENSE_KEY_SOURCE = Symbol('UPDATE_CLIENT_LICENSE_KEY_SOURCE');
exports.INSTALLED_VERSION_PROVIDER = Symbol('UPDATE_CLIENT_INSTALLED_VERSION_PROVIDER');
