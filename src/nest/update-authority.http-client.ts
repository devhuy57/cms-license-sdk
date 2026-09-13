import { createHash } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AvailableUpdateResult,
  DownloadComponentOptions,
  DownloadedComponentFile,
  HeartbeatInput,
  InstallationAuthorityPort,
  InstallationAuthorityUnreachableError,
  InstallationForbiddenError,
  InstallationNotFoundError,
  InstallationUnauthorizedError,
  RegisterInstallationResult,
  ReleaseComponentSnapshot,
  ReportStepInput,
  StartUpdateResult,
  UpdateConflictError,
  UpdateStepName,
} from './update-ports';

const INSTALLATION_TOKEN_HEADER = 'x-installation-token';
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

/** Component names become path segments; keep them boring. */
const SAFE_COMPONENT = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * The CMS's machine-facing installation API over native fetch.
 *
 * Every response goes through one `mapStatus`, so callers get a typed error
 * they can act on rather than a single "unreachable" that hides whether the
 * license lapsed, the token was revoked, or the network is down.
 */
export class UpdateAuthorityHttpClient implements InstallationAuthorityPort {
  private readonly base: string;

  constructor(
    authorityUrl: string,
    private readonly timeoutMs: number,
    private readonly defaultIdleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
  ) {
    this.base = `${authorityUrl.replace(/\/+$/, '')}/v1/installations`;
  }

  async register(input: {
    licenseKey: string;
    environment: string;
    hostname?: string;
    label?: string;
    currentVersion?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RegisterInstallationResult> {
    const body = await this.json<{
      installation?: { id?: string };
      installationToken?: string;
    }>(`${this.base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });

    const installationId = body?.installation?.id;
    const installationToken = body?.installationToken;
    if (!installationId || !installationToken) {
      throw new InstallationAuthorityUnreachableError(
        'installation register returned no installation id/token',
      );
    }
    return { installationId, installationToken };
  }

  async getUpdates(
    installationId: string,
    installationToken: string,
  ): Promise<AvailableUpdateResult> {
    const data = await this.json<{
      updateAvailable?: boolean;
      currentVersion?: string | null;
      latestRelease?: { id?: string; version?: string } | null;
      reason?: string | null;
      updatesUntil?: string | null;
    }>(`${this.base}/${installationId}/updates`, { method: 'GET' }, installationToken);

    return {
      updateAvailable: data?.updateAvailable ?? false,
      currentVersion: data?.currentVersion ?? null,
      latestVersion: data?.latestRelease?.version ?? null,
      latestReleaseId: data?.latestRelease?.id ?? null,
      reason: data?.reason ?? null,
      updatesUntil: data?.updatesUntil ?? null,
    };
  }

  async heartbeat(
    installationId: string,
    installationToken: string,
    input: HeartbeatInput,
  ): Promise<void> {
    await this.json(
      `${this.base}/${installationId}/heartbeat`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
      installationToken,
    );
  }

  async rotateToken(
    installationId: string,
    installationToken: string,
  ): Promise<RegisterInstallationResult> {
    const body = await this.json<{
      installation?: { id?: string };
      installationToken?: string;
    }>(
      `${this.base}/${installationId}/rotate-token`,
      { method: 'POST' },
      installationToken,
    );

    const id = body?.installation?.id;
    const token = body?.installationToken;
    if (!id || !token) {
      throw new InstallationAuthorityUnreachableError(
        'rotate-token returned no installation id/token',
      );
    }
    return { installationId: id, installationToken: token };
  }

  async startUpdate(
    installationId: string,
    installationToken: string,
    releaseId: string,
  ): Promise<StartUpdateResult> {
    const data = await this.json<{
      job?: {
        id?: string;
        status?: string;
        fromReleaseId?: string | null;
        toReleaseId?: string;
      };
      release?: {
        version?: string;
        releaseNotes?: string | null;
        components?: Array<{
          component?: string;
          componentVersion?: string;
          migrationRequired?: boolean;
        }>;
      };
      manifestToken?: string | null;
    }>(
      `${this.base}/${installationId}/updates/${releaseId}/start`,
      { method: 'POST' },
      installationToken,
    );

    const jobId = data?.job?.id;
    if (!jobId) {
      throw new InstallationAuthorityUnreachableError(
        'start update returned no job id',
      );
    }

    const components: ReleaseComponentSnapshot[] = (
      data?.release?.components ?? []
    )
      .filter((c): c is { component: string } & typeof c => Boolean(c.component))
      .map((c) => ({
        component: c.component as string,
        componentVersion: c.componentVersion ?? '',
        migrationRequired: c.migrationRequired ?? false,
      }));

    return {
      jobId,
      status: data?.job?.status ?? 'pending',
      fromReleaseId: data?.job?.fromReleaseId ?? null,
      toReleaseId: data?.job?.toReleaseId ?? releaseId,
      version: data?.release?.version ?? '',
      releaseNotes: data?.release?.releaseNotes ?? null,
      components,
      manifestToken: data?.manifestToken ?? null,
    };
  }

  async reportStep(
    installationId: string,
    installationToken: string,
    jobId: string,
    input: ReportStepInput,
  ): Promise<{ status: UpdateStepName }> {
    const data = await this.json<{ status?: UpdateStepName }>(
      `${this.base}/${installationId}/updates/${jobId}/report`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
      installationToken,
    );
    return { status: data?.status ?? input.step };
  }

  async abandonJob(
    installationId: string,
    installationToken: string,
    jobId: string,
    reason: string,
  ): Promise<void> {
    await this.json(
      `${this.base}/${installationId}/updates/${jobId}/abandon`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      },
      installationToken,
    );
  }

  async downloadComponent(
    installationId: string,
    installationToken: string,
    releaseId: string,
    component: string,
    options: DownloadComponentOptions,
  ): Promise<DownloadedComponentFile> {
    // The name comes from a server response and ends up in a filesystem path.
    if (!SAFE_COMPONENT.test(component)) {
      throw new InstallationAuthorityUnreachableError(
        `refusing to download component with unsafe name: ${component}`,
      );
    }

    const destDir = isAbsolute(options.destDir)
      ? options.destDir
      : resolvePath(process.cwd(), options.destDir);
    await fs.mkdir(destDir, { recursive: true });

    // Written under a dot-prefixed partial name and renamed on success, so a
    // half-written file can never be mistaken for a verified artifact.
    const partPath = join(destDir, `.${component}.part`);

    const idleMs = options.idleTimeoutMs ?? this.defaultIdleTimeoutMs;
    const controller = new AbortController();
    const abortOnCallerSignal = () => controller.abort();
    options.signal?.addEventListener('abort', abortOnCallerSignal, {
      once: true,
    });
    // An IDLE timer, refreshed per chunk. A single deadline covering the whole
    // transfer would abort every real download of a large artifact.
    let idleTimer: NodeJS.Timeout | undefined;
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), idleMs);
      idleTimer.unref?.();
    };

    try {
      armIdle();
      const response = await fetch(
        `${this.base}/${installationId}/updates/${releaseId}/components/${encodeURIComponent(component)}/download`,
        {
          method: 'GET',
          headers: { [INSTALLATION_TOKEN_HEADER]: installationToken },
          signal: controller.signal,
        },
      );
      mapStatus(response.status, await peekErrorBody(response), 'download');
      if (!response.body) {
        throw new InstallationAuthorityUnreachableError(
          'artifact download returned an empty body',
        );
      }

      const total = numberOrNull(response.headers.get('content-length'));
      const hash = createHash('sha256');
      let received = 0;

      const source = Readable.fromWeb(response.body as never);
      source.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        received += chunk.length;
        armIdle();
        options.onProgress?.(received, total);
      });

      await pipeline(source, createWriteStream(partPath, { mode: 0o600 }));

      const fileName =
        fileNameFromDisposition(response.headers.get('content-disposition')) ??
        `${component}.tar.gz`;
      const filePath = join(destDir, `${component}-${safeName(fileName)}`);
      await fs.rename(partPath, filePath);

      return {
        component,
        filePath,
        fileName,
        sizeBytes: received,
        sha256: hash.digest('hex'),
        contentType: response.headers.get('content-type'),
      };
    } catch (error) {
      await fs.rm(partPath, { force: true }).catch(() => undefined);
      throw wrapFetchError(error);
    } finally {
      clearTimeout(idleTimer);
      options.signal?.removeEventListener('abort', abortOnCallerSignal);
    }
  }

  /** One request → unwrapped `data`, with every status mapped to a typed error. */
  private async json<T>(
    url: string,
    init: RequestInit,
    installationToken?: string,
  ): Promise<T | undefined> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    if (installationToken) {
      headers[INSTALLATION_TOKEN_HEADER] = installationToken;
    }

    const response = await this.fetchWithTimeout(url, { ...init, headers });
    const body = await readJsonBody(response);
    mapStatus(response.status, body, url);
    return (body as { data?: T } | undefined)?.data;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw wrapFetchError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Maps an HTTP status to the error the caller can actually act on. The
 * distinction matters: a 401 means re-register, a 403 means tell the operator
 * to renew, a 409 means the job is already running, and only the rest are
 * worth retrying.
 */
function mapStatus(status: number, body: unknown, context: string): void {
  if (status >= 200 && status < 300) return;

  const message = messageFrom(body) ?? `${context} responded ${status}`;
  const code = codeFrom(body);

  if (status === 401) throw new InstallationUnauthorizedError(message);
  if (status === 403) throw new InstallationForbiddenError(message, code);
  if (status === 404) throw new InstallationNotFoundError(message);
  if (status === 409) throw new UpdateConflictError(message, code);
  throw new InstallationAuthorityUnreachableError(message);
}

function wrapFetchError(error: unknown): Error {
  if (
    error instanceof InstallationAuthorityUnreachableError ||
    error instanceof InstallationUnauthorizedError ||
    error instanceof InstallationForbiddenError ||
    error instanceof InstallationNotFoundError ||
    error instanceof UpdateConflictError
  ) {
    return error;
  }
  return new InstallationAuthorityUnreachableError(
    error instanceof Error ? error.message : 'installation authority unreachable',
  );
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Read an error body without consuming the stream we may still want. */
async function peekErrorBody(response: Response): Promise<unknown> {
  if (response.ok) return undefined;
  return readJsonBody(response);
}

function messageFrom(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const error = record.error as Record<string, unknown> | undefined;
  const message = error?.message ?? record.message;
  return typeof message === 'string' && message.length > 0 ? message : null;
}

function codeFrom(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const error = record.error as Record<string, unknown> | undefined;
  const code = error?.code ?? record.code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

function numberOrNull(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? null;
}

/** Strip anything that could steer the write out of `destDir`. */
function safeName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}
