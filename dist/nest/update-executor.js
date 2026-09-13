"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReleaseManifestMissingError = exports.NoUpdateExecutorError = exports.UPDATE_EXECUTOR = void 0;
exports.UPDATE_EXECUTOR = Symbol('UPDATE_EXECUTOR');
/** Raised by `UpdateRunner` when no executor is registered. */
class NoUpdateExecutorError extends Error {
    constructor() {
        super('no UPDATE_EXECUTOR provided: the host must implement UpdateExecutorPort to apply updates');
        this.name = 'NoUpdateExecutorError';
    }
}
exports.NoUpdateExecutorError = NoUpdateExecutorError;
/** Raised when `start` returns no manifest and unsigned releases are not allowed. */
class ReleaseManifestMissingError extends Error {
    constructor() {
        super('the CMS returned no signed release manifest; refusing to apply an unverified update');
        this.name = 'ReleaseManifestMissingError';
    }
}
exports.ReleaseManifestMissingError = ReleaseManifestMissingError;
