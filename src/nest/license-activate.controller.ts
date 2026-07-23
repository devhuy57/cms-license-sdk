import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LicenseClientService } from './license-client.service';

/**
 * PUBLIC activation endpoint (`POST /license/activate`). Accepts a license key,
 * verifies it against the authority, and — only if valid — persists it as the
 * active key and adopts it (no restart needed). Public because the key itself is
 * the credential; it cannot grant validity a forged key wouldn't already have.
 * Mounted only when `enableActivationEndpoint` is set. Rate-limit it upstream.
 *
 * Uses `@Body('licenseKey')` (not a DTO class) so it needs no class-validator
 * dependency and isn't stripped by a host `whitelist` ValidationPipe.
 */
@Controller('license')
export class LicenseActivateController {
  constructor(private readonly licenses: LicenseClientService) {}

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Body('licenseKey') licenseKey: string,
  ): Promise<{ valid: boolean; fresh: boolean; reason: string | null }> {
    const state = await this.licenses.activate(licenseKey ?? '');
    return { valid: state.valid, fresh: state.fresh, reason: state.reason };
  }
}
