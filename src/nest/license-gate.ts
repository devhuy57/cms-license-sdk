import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { LICENSE_CLIENT_OPTIONS, LicenseClientModuleOptions } from './constants';
import { LicenseClientService } from './license-client.service';

/**
 * Enforcement point. Checks the license at boot; when `enforce` is true an
 * invalid result throws and aborts startup (Nest never calls `listen`). Then
 * re-checks on an interval. The timer is `unref()`ed and cleared on shutdown.
 */
@Injectable()
export class LicenseGate implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LicenseGate.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(LICENSE_CLIENT_OPTIONS)
    private readonly options: LicenseClientModuleOptions,
    private readonly licenses: LicenseClientService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const state = await this.licenses.refresh();

    if (!state.valid) {
      const msg = `License check failed: ${state.reason ?? 'unknown'}.`;
      if (this.options.enforce) {
        throw new Error(
          `${msg} Startup blocked (licenseClient.enforce = true).`,
        );
      }
      this.logger.warn(`${msg} Continuing (enforce = false).`);
    } else {
      this.logger.log(
        `License valid${state.fresh ? '' : ' (offline grace)'}; features: ${state.claims?.features.join(', ')}.`,
      );
    }

    this.scheduleRecheck();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleRecheck(): void {
    this.timer = setInterval(() => {
      void this.licenses
        .refresh()
        .then((state) => {
          if (!state.valid) {
            this.logger.warn(
              `License re-check failed: ${state.reason ?? 'unknown'} (running process not interrupted).`,
            );
          }
        })
        .catch((err) =>
          this.logger.error(
            `License re-check errored: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }, this.options.recheckIntervalMs);

    this.timer.unref?.();
  }
}
