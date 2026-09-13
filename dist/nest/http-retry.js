"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RETRY_POLICY = void 0;
exports.withRetry = withRetry;
exports.DEFAULT_RETRY_POLICY = {
    attempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 8_000,
};
/**
 * Retries `fn` with full-jitter exponential backoff while `isRetryable` says
 * so. Full jitter rather than plain backoff because every installation of a
 * product tends to check in on the same schedule: if the CMS blips, a fixed
 * backoff has them all retry in lockstep and hit it again together.
 *
 * Deliberately NOT applied to every call — see `UpdateAuthorityHttpClient`.
 * Retrying a non-idempotent call whose response was merely lost (a started
 * update, a rotated token) does more damage than the failure it papers over.
 */
async function withRetry(fn, policy, isRetryable) {
    let lastError;
    for (let attempt = 1; attempt <= Math.max(1, policy.attempts); attempt++) {
        try {
            return await fn(attempt);
        }
        catch (error) {
            lastError = error;
            if (attempt >= policy.attempts || !isRetryable(error))
                throw error;
            await sleep(backoffMs(attempt, policy));
        }
    }
    throw lastError;
}
function backoffMs(attempt, policy) {
    const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
    return Math.floor(Math.random() * ceiling);
}
function sleep(ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        // Never hold the process open for a retry nap.
        timer.unref?.();
    });
}
