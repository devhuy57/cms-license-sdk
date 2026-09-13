import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import {
  UPDATE_CLIENT_OPTIONS,
  UpdateClientModuleOptions,
} from './update-client-constants';
import { UpdateClientService } from './update-client.service';

/**
 * Tells the CMS this installation is alive and which versions it runs, on a
 * timer, and refreshes the update check on the same beat.
 *
 * Structurally a sibling of `LicenseGate` with two deliberate differences.
 * It never blocks boot: there is nothing to enforce here, and a CMS outage
 * must not stop a customer's own updater from serving its status endpoint.
 * And it fails quietly — a missed beat costs the vendor a stale row in an
 * admin list, not the customer a working site.
 *
 * Interval defaults well below the license client's, because this is what
 * makes the vendor's "who is running what" view worth looking at, and what
 * decides how soon a customer is offered a new release.
 */
@Injectable()
export class InstallationHeartbeat
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InstallationHeartbeat.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(UPDATE_CLIENT_OPTIONS)
    private readonly options: UpdateClientModuleOptions,
    @Optional() private readonly updates?: UpdateClientService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const intervalMs = this.options.heartbeatIntervalMs ?? 0;
    if (intervalMs <= 0 || !this.updates) return;

    await this.beat();
    this.timer = setInterval(() => void this.beat(), intervalMs);
    // Never hold the process open just to send a heartbeat.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async beat(): Promise<void> {
    try {
      await this.updates?.heartbeat();
      await this.updates?.refresh();
    } catch (error) {
      this.logger.warn(
        `Heartbeat failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
