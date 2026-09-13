"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var UpdateRunner_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateRunner = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const core_1 = require("../core");
const update_client_constants_1 = require("./update-client-constants");
const update_client_service_1 = require("./update-client.service");
const update_executor_1 = require("./update-executor");
/**
 * Product hooks in the order they run.
 *
 * `migrating` deliberately precedes `building`. Migrations and the backend
 * are where an update actually goes wrong; rebuilding two Next apps is where
 * it costs 10-20 minutes. Putting the cheap, fragile step first means a bad
 * release is caught after one image, not after twenty minutes of build time.
 * The CMS imposes no ordering — `UpdateJob.recordStep` only mirrors the most
 * recent step — so the sequence is ours to choose.
 */
const PIPELINE = [
    { step: 'backing_up', hook: 'backup' },
    { step: 'installing', hook: 'install' },
    { step: 'migrating', hook: 'migrate' },
    { step: 'health_check', hook: 'healthCheck', phase: 'api' },
    { step: 'building', hook: 'build' },
    { step: 'switching', hook: 'switchOver' },
    { step: 'health_check', hook: 'healthCheck', phase: 'all' },
    { step: 'restarting', hook: 'restart' },
];
/** Truncated to the CMS's `errorMessage` column limit. */
const MAX_ERROR_MESSAGE = 2000;
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
let UpdateRunner = UpdateRunner_1 = class UpdateRunner {
    constructor(options, updates, executor) {
        this.options = options;
        this.updates = updates;
        this.executor = executor;
        this.logger = new common_1.Logger(UpdateRunner_1.name);
        /**
         * `step` is tracked here rather than passed around because `ctx.progress()`
         * is called from deep inside a step's own work and has no other way to know
         * which step it is reporting against. Only one job runs at a time, so a
         * single slot is enough.
         */
        this.running = null;
    }
    isBusy() {
        return this.running !== null;
    }
    /** Cancel the running job. Steps honour `ctx.signal`; the job closes as rolled back or failed. */
    cancel() {
        this.running?.controller.abort();
    }
    /**
     * Apply `releaseId`. Resolves once the job is closed — the caller is
     * expected to run this detached and poll its own job log, since the
     * pipeline outlives any sensible HTTP timeout.
     */
    async run(releaseId, hooks) {
        if (!this.executor)
            throw new update_executor_1.NoUpdateExecutorError();
        if (this.running) {
            throw new Error(`an update is already running (job ${this.running.jobId})`);
        }
        const started = await this.updates.startUpdate(releaseId);
        const controller = new AbortController();
        this.running = { jobId: started.jobId, controller, step: 'pending' };
        const workDir = (0, node_path_1.join)(this.options.workDir ?? '.license/updates', started.jobId);
        try {
            const manifest = this.verifyManifest(started.manifestToken, releaseId);
            const ctx = this.buildContext({
                jobId: started.jobId,
                releaseId,
                fromVersion: null,
                toVersion: started.version || manifest.version,
                manifest,
                workDir,
                signal: controller.signal,
                hooks,
            });
            await node_fs_1.promises.mkdir(workDir, { recursive: true });
            await this.preflight(ctx, hooks);
            ctx.components.push(...(await this.fetchAndVerify(ctx, releaseId, hooks)));
            await this.runPipeline(ctx, hooks);
            await this.report(ctx.jobId, 'completed', 'succeeded', hooks, {
                version: ctx.toVersion,
            });
            this.running = null;
            // After the job is closed, so a crash in here cannot corrupt it — this
            // is where a product replaces its own updater container.
            await this.executor.finalize?.(ctx).catch((error) => {
                this.logger.warn(`finalize failed: ${describe(error)}`);
            });
            // The manifest goes back to the caller so the host can record what it
            // actually installed, per component — a heartbeat that reports only the
            // release version loses the per-part detail the vendor's console shows.
            return { jobId: started.jobId, manifest };
        }
        catch (error) {
            this.running = null;
            throw error;
        }
        finally {
            await node_fs_1.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }
    /**
     * A missing manifest is a refusal, not a pass. An attacker impersonating
     * the CMS would also answer `null`, so treating it as "unsigned is fine"
     * would hand them the whole mechanism.
     */
    verifyManifest(manifestToken, releaseId) {
        if (!manifestToken)
            throw new update_executor_1.ReleaseManifestMissingError();
        const manifest = new core_1.Ed25519ReleaseManifestVerifier(this.options.publicKeyPem).verify(manifestToken);
        // Guards an honest CMS answering about the wrong release — a race with a
        // concurrent publish, or a client that mixed up two jobs.
        (0, core_1.assertManifestMatchesRelease)(manifest, releaseId);
        return manifest;
    }
    async preflight(ctx, hooks) {
        if (!this.executor?.preflight)
            return;
        await this.step(ctx, 'pending', hooks, async () => ({
            result: undefined,
            detail: (await this.executor.preflight(ctx)) ?? undefined,
        }));
    }
    async fetchAndVerify(ctx, releaseId, hooks) {
        const downloaded = await this.step(ctx, 'downloading', hooks, async () => {
            const files = [];
            for (const entry of ctx.manifest.components) {
                ctx.log(`downloading ${entry.component} (${entry.sizeBytes} bytes)`);
                files.push(await this.updates.downloadComponent(releaseId, entry.component, {
                    destDir: ctx.workDir,
                    signal: ctx.signal,
                    idleTimeoutMs: this.options.downloadIdleTimeoutMs,
                    onProgress: (received, total) => {
                        if (total)
                            ctx.progress(received / total, entry.component);
                    },
                }));
            }
            return {
                result: files,
                detail: {
                    components: files.map((f) => f.component),
                    totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
                },
            };
        });
        return this.step(ctx, 'verifying', hooks, () => {
            const verified = downloaded.map((file) => {
                const entry = (0, core_1.findManifestComponent)(ctx.manifest, file.component);
                // Throws before anything is unpacked — the whole point of the
                // manifest is that this happens first.
                (0, core_1.assertComponentDigest)(entry, {
                    sha256: file.sha256,
                    sizeBytes: file.sizeBytes,
                });
                return {
                    component: file.component,
                    componentVersion: entry.componentVersion,
                    migrationRequired: entry.migrationRequired,
                    filePath: file.filePath,
                    sha256: file.sha256,
                    sizeBytes: file.sizeBytes,
                };
            });
            return {
                result: verified,
                detail: { verified: verified.map((c) => c.component) },
            };
        });
    }
    async runPipeline(ctx, hooks) {
        for (const stage of PIPELINE) {
            const hook = this.executor?.[stage.hook];
            // An unimplemented optional hook emits no step, rather than a
            // fabricated success the vendor's timeline would then show as real.
            if (typeof hook !== 'function')
                continue;
            try {
                await this.step(ctx, stage.step, hooks, async () => {
                    const detail = stage.hook === 'healthCheck'
                        ? await this.executor.healthCheck(ctx, stage.phase ?? 'all')
                        : await hook.call(this.executor, ctx);
                    return { result: undefined, detail: detail ?? undefined };
                });
            }
            catch (error) {
                await this.rollback(ctx, stage.step, error, hooks);
                throw error;
            }
        }
    }
    async rollback(ctx, failedStep, error, hooks) {
        if (!this.executor?.rollback) {
            // Nothing was undone, so the job stays `failed`. Reporting
            // `rolled_back` here would tell the vendor a deployment recovered when
            // it is in fact half-updated.
            this.logger.error(`Update failed at ${failedStep} and no rollback is implemented: ${describe(error)}`);
            return;
        }
        try {
            await this.step(ctx, 'rolled_back', hooks, async () => ({
                result: undefined,
                detail: (await this.executor.rollback(ctx, failedStep, error instanceof Error ? error : new Error(describe(error)))) ?? undefined,
            }));
        }
        catch (rollbackError) {
            // Reported as a failed rollback rather than swallowed: a deployment
            // that could not be put back is the one case that needs a human.
            await this.report(ctx.jobId, 'rolled_back', 'failed', hooks, undefined, describe(rollbackError));
        }
    }
    /** Wraps one unit of work in a started/succeeded/failed pair of reports. */
    async step(ctx, step, hooks, work) {
        if (this.running?.jobId === ctx.jobId)
            this.running.step = step;
        await this.report(ctx.jobId, step, 'started', hooks);
        try {
            const { result, detail } = await work();
            await this.report(ctx.jobId, step, 'succeeded', hooks, detail);
            return result;
        }
        catch (error) {
            await this.report(ctx.jobId, step, 'failed', hooks, undefined, describe(error));
            throw error;
        }
    }
    /**
     * Best-effort by design. A CMS outage must not abort an update that is
     * already rewriting a customer's source tree — the local log keeps the
     * record either way.
     */
    async report(jobId, step, outcome, hooks, detail, errorMessage) {
        const event = {
            jobId,
            step,
            outcome,
            detail,
            errorMessage,
            at: new Date().toISOString(),
        };
        hooks?.onStep?.(event);
        try {
            await this.updates.reportStep(jobId, {
                step,
                outcome,
                detail,
                errorMessage: errorMessage?.slice(0, MAX_ERROR_MESSAGE),
            });
        }
        catch (error) {
            this.logger.warn(`Could not report ${step}/${outcome} to the CMS: ${describe(error)}`);
        }
    }
    buildContext(input) {
        const logger = this.logger;
        const runner = this;
        return {
            jobId: input.jobId,
            releaseId: input.releaseId,
            fromVersion: input.fromVersion,
            toVersion: input.toVersion,
            manifest: input.manifest,
            components: [],
            workDir: input.workDir,
            signal: input.signal,
            log(line) {
                logger.log(`[${input.jobId}] ${line}`);
            },
            progress(fraction, note) {
                input.hooks?.onStep?.({
                    jobId: input.jobId,
                    // The step that is actually running. Hardcoding `downloading` here
                    // made a long `building` step emit download events, which the
                    // customer's progress panel then rendered as a stalled download.
                    step: runner.running?.step ?? 'downloading',
                    outcome: 'started',
                    detail: { progress: Math.min(1, Math.max(0, fraction)), note },
                    at: new Date().toISOString(),
                });
            },
        };
    }
};
exports.UpdateRunner = UpdateRunner;
exports.UpdateRunner = UpdateRunner = UpdateRunner_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(update_client_constants_1.UPDATE_CLIENT_OPTIONS)),
    __param(2, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)(update_executor_1.UPDATE_EXECUTOR)),
    __metadata("design:paramtypes", [Object, update_client_service_1.UpdateClientService, Object])
], UpdateRunner);
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
