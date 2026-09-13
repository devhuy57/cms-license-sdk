export interface RetryPolicy {
    /** Total attempts including the first. `1` disables retrying. */
    attempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
}
export declare const DEFAULT_RETRY_POLICY: RetryPolicy;
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
export declare function withRetry<T>(fn: (attempt: number) => Promise<T>, policy: RetryPolicy, isRetryable: (error: unknown) => boolean): Promise<T>;
