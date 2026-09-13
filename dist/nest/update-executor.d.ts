import type { ReleaseManifestClaims } from '../core';
import type { UpdateStepName } from './update-ports';
/** A component's artifact, downloaded and already checked against the manifest. */
export interface VerifiedComponent {
    component: string;
    componentVersion: string;
    migrationRequired: boolean;
    /** Absolute path of the verified tarball. */
    filePath: string;
    sha256: string;
    sizeBytes: number;
}
/** Anything a step wants recorded alongside its outcome. */
export type StepDetail = Record<string, unknown> | void;
export interface UpdateStepContext {
    jobId: string;
    releaseId: string;
    fromVersion: string | null;
    toVersion: string;
    /** The verified manifest. Authoritative — prefer it over anything re-fetched. */
    manifest: ReleaseManifestClaims;
    /** Ordered as the manifest lists them. */
    components: VerifiedComponent[];
    /** Scratch space for this job; the runner creates and cleans it. */
    workDir: string;
    /** Aborted when the job is cancelled. Long shell steps must honour it. */
    signal: AbortSignal;
    /** Appended to the step's reported detail and to the host's own log. */
    log(line: string): void;
    /** 0..1 within the current step. The build step runs for 10-20 minutes; silence there reads as a hang. */
    progress(fraction: number, note?: string): void;
}
/**
 * The half of an update that depends on how a product is deployed.
 *
 * The SDK owns everything identical across products — starting the job,
 * downloading, verifying signatures and digests, reporting every step,
 * ordering the pipeline, and deciding when to roll back. This interface is
 * everything that is not: unpacking over a source tree, running migrations,
 * rebuilding images, restarting containers. Those are shell commands wired to
 * one deployment topology, and a Laravel app, a Go binary and a compose stack
 * share nothing useful there.
 *
 * Only `install` and `healthCheck` are required — they are the minimum that
 * makes an update real and provable. An unimplemented optional hook emits no
 * step at all, rather than a fabricated `succeeded`, so the vendor's timeline
 * shows what actually ran.
 */
export interface UpdateExecutorPort {
    /** Put the new code in place. Reported as `installing`. */
    install(ctx: UpdateStepContext): Promise<StepDetail>;
    /**
     * Prove the deployment answers. Called twice: `api` after the backend is
     * replaced (the cheapest place to abort — the web builds have not run yet),
     * and `all` once everything is switched over.
     */
    healthCheck(ctx: UpdateStepContext, phase: 'api' | 'all'): Promise<StepDetail>;
    /** Folded into `pending`: disk, socket, compose file, no other job running. */
    preflight?(ctx: UpdateStepContext): Promise<StepDetail>;
    /** Reported as `backing_up`. Whatever `rollback` will need. */
    backup?(ctx: UpdateStepContext): Promise<StepDetail>;
    /** Reported as `migrating`. */
    migrate?(ctx: UpdateStepContext): Promise<StepDetail>;
    /** Reported as `building`. */
    build?(ctx: UpdateStepContext): Promise<StepDetail>;
    /** Reported as `switching`. */
    switchOver?(ctx: UpdateStepContext): Promise<StepDetail>;
    /** Reported as `restarting`. */
    restart?(ctx: UpdateStepContext): Promise<StepDetail>;
    /**
     * Undo a failed update. Absent means a failure ends the job at `failed`
     * rather than `rolled_back` — an honest outcome, since without this hook
     * nothing was undone.
     */
    rollback?(ctx: UpdateStepContext, failedStep: UpdateStepName, error: Error): Promise<StepDetail>;
    /**
     * Runs after `completed` is reported and the job is closed. For work that
     * must not be able to corrupt the job if it dies — most of all, a product
     * whose updater is itself part of the release replacing its own container.
     */
    finalize?(ctx: UpdateStepContext): Promise<void>;
}
export declare const UPDATE_EXECUTOR: unique symbol;
/** Raised by `UpdateRunner` when no executor is registered. */
export declare class NoUpdateExecutorError extends Error {
    constructor();
}
/** Raised when `start` returns no manifest and unsigned releases are not allowed. */
export declare class ReleaseManifestMissingError extends Error {
    constructor();
}
