import {
  AuthorityVerifyResult,
  LicenseAuthorityPort,
  LicenseAuthorityUnreachableError,
} from './ports';

/**
 * Calls `POST {authorityUrl}/v1/licenses/verify` via native fetch with an
 * AbortController timeout. Network/timeout/non-2xx → LicenseAuthorityUnreachableError
 * so the caller falls back to cache + grace.
 */
export class LicenseAuthorityHttpClient implements LicenseAuthorityPort {
  private readonly endpoint: string;

  constructor(
    authorityUrl: string,
    private readonly timeoutMs: number,
  ) {
    this.endpoint = `${authorityUrl.replace(/\/+$/, '')}/v1/licenses/verify`;
  }

  async verify(input: {
    licenseKey: string;
    domain: string | null;
  }): Promise<AuthorityVerifyResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          licenseKey: input.licenseKey,
          ...(input.domain ? { domain: input.domain } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new LicenseAuthorityUnreachableError(
          `authority responded ${response.status}`,
        );
      }
      const body = (await response.json()) as {
        data?: Partial<AuthorityVerifyResult>;
      };
      const data = body.data ?? {};
      return {
        valid: data.valid ?? false,
        reason: data.reason ?? null,
        status: data.status ?? null,
        token: data.token ?? null,
      };
    } catch (error) {
      if (error instanceof LicenseAuthorityUnreachableError) throw error;
      throw new LicenseAuthorityUnreachableError(
        error instanceof Error ? error.message : 'authority unreachable',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
