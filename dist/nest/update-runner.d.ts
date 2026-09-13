import { type ReleaseManifestClaims } from '../core';
import { UpdateClientModuleOptions } from './update-client-constants';
import { UpdateClientService } from './update-client.service';
import { type UpdateExecutorPort } from './update-executor';
import type { UpdateStepName } from './update-ports';
/** A step as it happened locally, for the host's own log and status endpoint. */
export interface LocalStepEvent {
    jobId: string;
    step: UpdateStepName;
    outcome: 'started' | 'succeeded' | 'failed';
    detail?: Record<string, unknown>;
    errorMessage?: string;
    at: string;
}
export interface RunUpdateHooks {
    onStep?(event: LocalStepEvent): void;
}
/**
 * Drives one update from start to finish: opens the job, verifies the signed
 * manifest, fetches and checks every artifact, runs the product's hooks in
 * order, and closes the job — rolling back and reporting honestly when a step
 * fails.
 *
 * Reporting is best-effort throughout. Applying an update must not be
 * hostage to the vendor's uptime: if the CMS is unreachable mid-pipeline the
 * work continues and the local log keeps the record.
 */
export declare class UpdateRunner {
    private readonly options;
    private readonly updates;
    private readonly executor?;
    private readonly logger;
    /**
     * `step` is tracked here rather than passed around because `ctx.progress()`
     * is called from deep inside a step's own work and has no other way to know
     * which step it is reporting against. Only one job runs at a time, so a
     * single slot is enough.
     */
    private running;
    constructor(options: UpdateClientModuleOptions, updates: UpdateClientService, executor?: UpdateExecutorPort | undefined);
    isBusy(): boolean;
    /** Cancel the running job. Steps honour `ctx.signal`; the job closes as rolled back or failed. */
    cancel(): void;
    /**
     * Apply `releaseId`. Resolves once the job is closed — the caller is
     * expected to run this detached and poll its own job log, since the
     * pipeline outlives any sensible HTTP timeout.
     */
    run(releaseId: string, hooks?: RunUpdateHooks): Promise<{
        jobId: string;
        manifest: ReleaseManifestClaims;
    }>;
    /**
     * A missing manifest is a refusal, not a pass. An attacker impersonating
     * the CMS would also answer `null`, so treating it as "unsigned is fine"
     * would hand them the whole mechanism.
     */
    private verifyManifest;
    private preflight;
    private fetchAndVerify;
    private runPipeline;
    private rollback;
    /** Wraps one unit of work in a started/succeeded/failed pair of reports. */
    private step;
    /**
     * Best-effort by design. A CMS outage must not abort an update that is
     * already rewriting a customer's source tree — the local log keeps the
     * record either way.
     */
    private report;
    private buildContext;
}
