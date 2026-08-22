import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { LicenseClientService } from './license-client.service';

export type PublicLicenseSnapshot = {
  /**
   * Marks this payload as already-enveloped so a host `ResponseInterceptor`
   * that pass-throughs `{ success: boolean }` does not wrap `valid` under
   * `data` (which would hide it from the Next.js gate).
   */
  success: true;
  valid: boolean;
  fresh: boolean;
  reason: string | null;
};

/**
 * PUBLIC license endpoints for self-served installs. Mounted only when
 * `enableActivationEndpoint` is set. Rate-limit them upstream.
 *
 * - `POST /license/activate` — accept a key, verify online, persist if valid.
 * - `GET  /license/status`  — whether this install is already licensed (no key
 *   leaked). Front-end gates use this so one activation unlocks every browser.
 *
 * Public because the key itself is the credential on activate, and status only
 * exposes a boolean that the cosmetic FE gate already needs. Real enforcement
 * stays on the backend boot gate / `LicenseClientService`.
 *
 * Uses `@Body('licenseKey')` (not a DTO class) so it needs no class-validator
 * dependency and isn't stripped by a host `whitelist` ValidationPipe.
 */
@Controller('license')
export class LicenseActivateController {
  constructor(private readonly licenses: LicenseClientService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  status(): PublicLicenseSnapshot {
    const state = this.licenses.getState();
    return {
      success: true,
      valid: state.valid,
      fresh: state.fresh,
      reason: state.reason,
    };
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Body('licenseKey') licenseKey: string,
  ): Promise<PublicLicenseSnapshot> {
    const state = await this.licenses.activate(licenseKey ?? '');
    return {
      success: true,
      valid: state.valid,
      fresh: state.fresh,
      reason: state.reason,
    };
  }
}
