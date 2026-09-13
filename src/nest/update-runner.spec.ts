import { generateKeyPairSync } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ed25519ReleaseManifestSigner,
  RELEASE_MANIFEST_VERSION,
  sha256Hex,
  type ReleaseManifestClaims,
} from '../core';
import { UpdateClientModuleOptions } from './update-client-constants';
import { UpdateClientService } from './update-client.service';
import {
  NoUpdateExecutorError,
  ReleaseManifestMissingError,
  type UpdateExecutorPort,
  type UpdateStepContext,
} from './update-executor';
import { UpdateRunner, type LocalStepEvent } from './update-runner';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const PRIVATE_PEM = privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();

const API_BYTES = Buffer.from('api tarball');

function manifest(
  overrides: Partial<ReleaseManifestClaims> = {},
): ReleaseManifestClaims {
  return {
    v: RELEASE_MANIFEST_VERSION,
    releaseId: 'rel-1',
    productId: 'nguonvia',
    version: '1.3.0',
    channel: 'stable',
    gitRef: null,
    minUpgradableFrom: null,
    components: [
      {
        component: 'api',
        componentVersion: '1.3.0',
        sha256: sha256Hex(API_BYTES),
        sizeBytes: API_BYTES.length,
        migrationRequired: true,
      },
    ],
    iat: 1_790_000_000,
    ...overrides,
  };
}

function signed(claims = manifest()): string {
  return new Ed25519ReleaseManifestSigner(PRIVATE_PEM).sign(claims);
}

interface Harness {
  runner: UpdateRunner;
  calls: string[];
  events: LocalStepEvent[];
  updates: { reportStep: jest.Mock; startUpdate: jest.Mock; downloadComponent: jest.Mock };
}

async function build(parts: {
  manifestToken?: string | null;
  executor?: Partial<UpdateExecutorPort> | null;
  downloadSha?: string;
  options?: Partial<UpdateClientModuleOptions>;
} = {}): Promise<Harness> {
  const workDir = await fs.mkdtemp(join(tmpdir(), 'update-runner-'));
  const calls: string[] = [];
  const events: LocalStepEvent[] = [];

  const record =
    (name: string, fail = false) =>
    () => {
      calls.push(name);
      if (fail) throw new Error(`${name} blew up`);
      return Promise.resolve(undefined);
    };

  const executor: UpdateExecutorPort | null =
    parts.executor === null
      ? null
      : ({
          install: record('install'),
          healthCheck: (_ctx: UpdateStepContext, phase: string) => {
            calls.push(`healthCheck:${phase}`);
            return Promise.resolve(undefined);
          },
          ...parts.executor,
        } as UpdateExecutorPort);

  const updates = {
    startUpdate: jest.fn().mockResolvedValue({
      jobId: 'job-1',
      status: 'pending',
      fromReleaseId: null,
      toReleaseId: 'rel-1',
      version: '1.3.0',
      releaseNotes: null,
      components: [],
      manifestToken:
        parts.manifestToken === undefined ? signed() : parts.manifestToken,
    }),
    downloadComponent: jest.fn().mockImplementation(async () => {
      const filePath = join(workDir, 'api.tar.gz');
      await fs.writeFile(filePath, API_BYTES);
      return {
        component: 'api',
        filePath,
        fileName: 'api.tar.gz',
        sizeBytes: API_BYTES.length,
        sha256: parts.downloadSha ?? sha256Hex(API_BYTES),
        contentType: 'application/gzip',
      };
    }),
    reportStep: jest.fn().mockResolvedValue({ status: 'pending' }),
  };

  const options = {
    authorityUrl: 'https://cms.test',
    licenseKey: 'KEY',
    environment: 'production',
    requestTimeoutMs: 1000,
    workDir,
    publicKeyPem: PUBLIC_PEM,
    ...parts.options,
  } as UpdateClientModuleOptions;

  const runner = new UpdateRunner(
    options,
    updates as unknown as UpdateClientService,
    executor ?? undefined,
  );

  return { runner, calls, events, updates };
}

function stepsOf(updates: Harness['updates']): string[] {
  return updates.reportStep.mock.calls.map(
    ([, input]: [string, { step: string; outcome: string }]) =>
      `${input.step}/${input.outcome}`,
  );
}

describe('UpdateRunner', () => {
  it('runs the whole pipeline and closes the job', async () => {
    const h = await build({
      executor: {
        preflight: () => Promise.resolve(undefined),
        backup: () => Promise.resolve(undefined),
        migrate: () => Promise.resolve(undefined),
        build: () => Promise.resolve(undefined),
        switchOver: () => Promise.resolve(undefined),
        restart: () => Promise.resolve(undefined),
      },
    });

    const result = await h.runner.run('rel-1');

    expect(result.jobId).toBe('job-1');
    expect(stepsOf(h.updates)).toContain('completed/succeeded');
  });

  it('runs migrating before building, so a bad release fails cheap', async () => {
    // Migrations and the backend are where updates go wrong; rebuilding two
    // Next apps is where they cost twenty minutes.
    const calls: string[] = [];
    const track = (name: string) => () => {
      calls.push(name);
      return Promise.resolve(undefined);
    };
    const h = await build({
      executor: {
        backup: track('backup'),
        migrate: track('migrate'),
        build: track('build'),
        install: track('install'),
        healthCheck: (_ctx: UpdateStepContext, phase: string) => {
          calls.push(`healthCheck:${phase}`);
          return Promise.resolve(undefined);
        },
      },
    });

    await h.runner.run('rel-1');

    expect(calls).toEqual([
      'backup',
      'install',
      'migrate',
      'healthCheck:api',
      'build',
      'healthCheck:all',
    ]);
  });

  it('emits no step for a hook the product did not implement', async () => {
    // A fabricated `succeeded` would show in the vendor's timeline as work
    // that really happened.
    const h = await build({});

    await h.runner.run('rel-1');

    const steps = stepsOf(h.updates);
    expect(steps).not.toContain('backing_up/started');
    expect(steps).not.toContain('building/started');
    expect(steps).toContain('installing/succeeded');
  });

  it('refuses to apply a release with no signed manifest', async () => {
    // An attacker impersonating the CMS would also answer null, so treating
    // that as "unsigned is fine" hands them the whole mechanism.
    const h = await build({ manifestToken: null });

    await expect(h.runner.run('rel-1')).rejects.toThrow(
      ReleaseManifestMissingError,
    );
    expect(h.calls).toEqual([]);
  });

  it('refuses a manifest signed by the wrong key', async () => {
    const other = generateKeyPairSync('ed25519');
    const h = await build({
      options: {
        publicKeyPem: other.publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      },
    });

    await expect(h.runner.run('rel-1')).rejects.toThrow(
      'signature verification failed',
    );
    expect(h.calls).toEqual([]);
  });

  it('refuses a manifest describing a different release', async () => {
    const h = await build({
      manifestToken: signed(manifest({ releaseId: 'rel-other' })),
    });

    await expect(h.runner.run('rel-1')).rejects.toThrow('releaseId mismatch');
    expect(h.calls).toEqual([]);
  });

  it('stops before unpacking when a download does not match the manifest', async () => {
    const h = await build({ downloadSha: 'b'.repeat(64) });

    await expect(h.runner.run('rel-1')).rejects.toThrow(
      'does not match the signed manifest',
    );
    // The whole point of verifying first: install must never have run.
    expect(h.calls).toEqual([]);
    expect(stepsOf(h.updates)).toContain('verifying/failed');
  });

  it('rolls back and reports it when a step fails', async () => {
    const h = await build({
      executor: {
        build: () => {
          throw new Error('out of memory');
        },
        rollback: () => Promise.resolve({ restored: true }),
      },
    });

    await expect(h.runner.run('rel-1')).rejects.toThrow('out of memory');

    const steps = stepsOf(h.updates);
    expect(steps).toContain('building/failed');
    expect(steps).toContain('rolled_back/succeeded');
    expect(steps).not.toContain('completed/succeeded');
  });

  it('leaves the job failed when the product implements no rollback', async () => {
    // Reporting `rolled_back` would tell the vendor a deployment recovered
    // when it is in fact half-updated.
    const h = await build({
      executor: {
        install: () => {
          throw new Error('extract failed');
        },
      },
    });

    await expect(h.runner.run('rel-1')).rejects.toThrow('extract failed');

    const steps = stepsOf(h.updates);
    expect(steps).toContain('installing/failed');
    expect(steps.some((s) => s.startsWith('rolled_back'))).toBe(false);
  });

  it('reports a failed rollback rather than swallowing it', async () => {
    const h = await build({
      executor: {
        install: () => {
          throw new Error('extract failed');
        },
        rollback: () => {
          throw new Error('restore failed too');
        },
      },
    });

    await expect(h.runner.run('rel-1')).rejects.toThrow('extract failed');
    expect(stepsOf(h.updates)).toContain('rolled_back/failed');
  });

  it('keeps going when the CMS cannot be reached for a step report', async () => {
    // Applying an update must not be hostage to the vendor's uptime once it
    // has started rewriting a customer's source tree.
    const h = await build({});
    h.updates.reportStep.mockRejectedValue(new Error('CMS down'));

    await expect(h.runner.run('rel-1')).resolves.toEqual({ jobId: 'job-1' });
    expect(h.calls).toContain('install');
  });

  it('runs finalize only after the job is closed', async () => {
    const order: string[] = [];
    const h = await build({
      executor: {
        finalize: () => {
          order.push('finalize');
          return Promise.resolve();
        },
      },
    });
    h.updates.reportStep.mockImplementation(
      (_job: string, input: { step: string }) => {
        if (input.step === 'completed') order.push('completed');
        return Promise.resolve({ status: input.step });
      },
    );

    await h.runner.run('rel-1');

    expect(order).toEqual(['completed', 'finalize']);
  });

  it('does not fail the update when finalize throws', async () => {
    const h = await build({
      executor: {
        finalize: () => Promise.reject(new Error('self-recreate failed')),
      },
    });

    await expect(h.runner.run('rel-1')).resolves.toEqual({ jobId: 'job-1' });
  });

  it('refuses a second concurrent run', async () => {
    let release!: () => void;
    const h = await build({
      executor: {
        install: () =>
          new Promise<undefined>((resolve) => {
            release = () => resolve(undefined);
          }),
      },
    });

    const first = h.runner.run('rel-1');
    // `run` awaits startUpdate, the manifest check and the download before it
    // reaches the blocked hook, so drain the queue rather than one microtask.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.runner.isBusy()).toBe(true);
    await expect(h.runner.run('rel-1')).rejects.toThrow('already running');

    release();
    await first;
    expect(h.runner.isBusy()).toBe(false);
  });

  it('throws a clear error when no executor is registered', async () => {
    const h = await build({ executor: null });

    await expect(h.runner.run('rel-1')).rejects.toThrow(NoUpdateExecutorError);
  });
});
