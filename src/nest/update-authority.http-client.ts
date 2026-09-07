import {
  AvailableUpdateResult,
  InstallationAuthorityPort,
  InstallationAuthorityUnreachableError,
  InstallationUnauthorizedError,
  RegisterInstallationResult,
} from './update-ports';

const INSTALLATION_TOKEN_HEADER = 'x-installation-token';

/**
 * Calls `POST {authorityUrl}/v1/installations/register` and
 * `GET {authorityUrl}/v1/installations/:id/updates` via native fetch with an
 * AbortController timeout. Network/timeout/non-2xx (other than 401) →
 * `InstallationAuthorityUnreachableError`; a 401 on `getUpdates` →
 * `InstallationUnauthorizedError`, which the caller uses to trigger
 * re-registration.
 */
export class UpdateAuthorityHttpClient implements InstallationAuthorityPort {
  private readonly base: string;

  constructor(
    authorityUrl: string,
    private readonly timeoutMs: number,
  ) {
    this.base = `${authorityUrl.replace(/\/+$/, '')}/v1/installations`;
  }

  async register(input: {
    licenseKey: string;
    environment: string;
    hostname?: string;
    label?: string;
    currentVersion?: string;
  }): Promise<RegisterInstallationResult> {
    const response = await this.fetchWithTimeout(`${this.base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new InstallationAuthorityUnreachableError(
        `installation register responded ${response.status}`,
      );
    }
    const body = (await response.json()) as {
      data?: { installation?: { id?: string }; installationToken?: string };
    };
    const installationId = body.data?.installation?.id;
    const installationToken = body.data?.installationToken;
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
    const response = await this.fetchWithTimeout(
      `${this.base}/${installationId}/updates`,
      {
        method: 'GET',
        headers: { [INSTALLATION_TOKEN_HEADER]: installationToken },
      },
    );
    if (response.status === 401) {
      throw new InstallationUnauthorizedError(
        'installation token rejected by the CMS',
      );
    }
    if (!response.ok) {
      throw new InstallationAuthorityUnreachableError(
        `installation updates check responded ${response.status}`,
      );
    }
    const body = (await response.json()) as {
      data?: {
        updateAvailable?: boolean;
        currentVersion?: string | null;
        latestRelease?: { id?: string; version?: string } | null;
      };
    };
    const data = body.data ?? {};
    return {
      updateAvailable: data.updateAvailable ?? false,
      currentVersion: data.currentVersion ?? null,
      latestVersion: data.latestRelease?.version ?? null,
      latestReleaseId: data.latestRelease?.id ?? null,
    };
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
      throw new InstallationAuthorityUnreachableError(
        error instanceof Error ? error.message : 'installation authority unreachable',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
