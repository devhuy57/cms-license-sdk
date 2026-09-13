"use strict";
/**
 * Key-material plumbing shared by the license-token and release-manifest
 * signers. Its own module so `release-manifest.ts` does not have to import
 * from `index.ts`, which re-exports it — that cycle happens to work under
 * CommonJS function hoisting, and is exactly the kind of thing that stops
 * working the day someone changes a `function` to a `const`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePem = normalizePem;
exports.readEnv = readEnv;
/** Accept a full PEM or base64-of-PEM (env-var friendly). */
function normalizePem(value) {
    const trimmed = value?.trim();
    if (!trimmed)
        return '';
    if (trimmed.includes('-----BEGIN'))
        return trimmed;
    try {
        return Buffer.from(trimmed, 'base64').toString('utf8');
    }
    catch {
        return trimmed;
    }
}
/** Safe process.env read (never throws, works if `process` is absent). */
function readEnv(name) {
    try {
        return ((typeof process !== 'undefined' && process.env && process.env[name]) || '');
    }
    catch {
        return '';
    }
}
