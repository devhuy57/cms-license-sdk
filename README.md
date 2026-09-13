# @cmsnt/license-sdk

Reusable Ed25519 license SDK, shared across products. Three entrypoints:

| Import | Runtime | For |
|---|---|---|
| `@cmsnt/license-sdk/core` | Node (`node:crypto`) | License **server** (sign) + Node **backends** (verify) |
| `@cmsnt/license-sdk/nest` | NestJS | **Backend** enforcement client (verify + boot gate + heartbeat), plus an update-availability client |
| `@cmsnt/license-sdk/edge` | Web Crypto (`crypto.subtle`) | **Frontend** / edge (browser) verify — framework-agnostic |
| `@cmsnt/license-sdk/next` | Next.js middleware | **Self-served activation** gate: renders its own key-entry form + cookie |

A token is `base64url(claimsJSON).base64url(ed25519Signature)`. The raw license
key never travels — only its SHA-256 (`sub`). Only the license server holds the
private key; everything shipped to customers embeds the public key (verify-only).

## Install (git dependency)

```bash
pnpm add github:devhuy57/cms-license-sdk#v0.1.0
```

The package name (for imports) is `@cmsnt/license-sdk`; the git repo is
`devhuy57/cms-license-sdk`. `dist/` is committed, so no build step runs on install.

## Zero-wiring via environment variables

Every entrypoint falls back to an env var when you don't pass a key explicitly —
so a product can just set the OS/CI env var, no code wiring and no `.env` file
required:

| Entrypoint | Env var (fallback) | Read at |
|---|---|---|
| `core` server (`Ed25519LicenseSigner()`) | `LICENSE_PRIVATE_KEY_PEM` | runtime (Node) |
| `core` / `nest` verify | `LICENSE_PUBLIC_KEY` | runtime (Node) |
| `edge` (`checkLicense` / `verifyLicenseToken`) | `NEXT_PUBLIC_LICENSE_PUBLIC_KEY` | **build time** (Next inlines it) |

> **Node** (server/backend) reads the OS env at runtime — set it however you
> deploy. **Browser/edge** cannot read OS env at runtime: Next inlines
> `NEXT_PUBLIC_LICENSE_PUBLIC_KEY` at `build` time, so set it in the OS/CI before
> building; the `NEXT_PUBLIC_` prefix is mandatory. Keys are public, so this is
> safe. An explicit argument always overrides the env fallback.

## Generate a keypair (once)

```js
import { generateKeyPairSync } from 'node:crypto';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()); // server ONLY
console.log(publicKey.export({ type: 'spki', format: 'pem' }).toString());   // embed in clients
```

## `core` — license server (sign) & Node verify

```ts
import { Ed25519LicenseSigner, buildLicenseTokenClaims } from '@cmsnt/license-sdk/core';

const signer = new Ed25519LicenseSigner(process.env.LICENSE_PRIVATE_KEY_PEM!);
const token = signer.sign(
  buildLicenseTokenClaims({
    key: license.licenseKey, productId: license.productId, status: license.status,
    boundIp: ip, boundDomain: domain,
    licenseExpiresAt: license.expiresAt?.toISOString() ?? null,
    issuedAt: new Date(), tokenTtlSeconds: 86_400, graceSeconds: 1_296_000,
    features: ['core'], secretSalt: process.env.LICENSE_SECRET_SALT!,
  }),
);
// return { valid: true, ..., token }
```

Also exports `Ed25519LicenseVerifier`, `decodeLicenseTokenPayload`,
`isTokenFresh`, `isWithinGrace`, `isLicenseExpired`, `hashLicenseKey`,
`deriveRuntimeSecret`.

## `nest` — backend enforcement client

```ts
// api.module.ts
import { LicenseClientModule } from '@cmsnt/license-sdk/nest';

const licenseClientImports = cfg.licenseClient.enabled
  ? [LicenseClientModule.forRoot(cfg.licenseClient)]
  : [];
// ...imports: [...licenseClientImports]
```

`forRoot(options)` — `{ authorityUrl, licenseKey, productId, publicKeyPem, domain,
cachePath, recheckIntervalMs, requiredFeature, enforce, requestTimeoutMs }`.
At boot it verifies online → caches; offline it runs on the cached token while
within grace. `enforce: true` aborts startup on an invalid license.

**Status endpoint stays in your app** (auth is app-specific) — inject the
exported `LicenseClientService`:

```ts
@Controller('license')
export class LicenseStatusController {
  constructor(private readonly licenses: LicenseClientService) {}
  @Get('status') @AdminAuth()
  status() {
    const s = this.licenses.getState();
    return { valid: s.valid, fresh: s.fresh, reason: s.reason,
             features: s.claims?.features ?? [], licenseExpiresAt: s.claims?.licenseExpiresAt ?? null };
  }
}
```

`LicenseClientService` also exposes `isValid()`, `hasFeature(f)`, and
`getRuntimeSecret()` (Phase B). Peer dep: `@nestjs/common` + `reflect-metadata`.

### `nest` — update client

Registers this process as an `Installation` with the CMS, reports what it runs,
and carries the transport half of applying an update: start, download, verify,
report each step.

```ts
// api.module.ts (or a dedicated updater app)
import { UpdateClientModule } from '@cmsnt/license-sdk/nest';

const updateClientImports = cfg.updateClient.enabled
  ? [UpdateClientModule.forRoot(cfg.updateClient)]
  : [];
// ...imports: [...updateClientImports]
```

`forRoot(options)` — `{ authorityUrl, licenseKey, keyStorePath?, environment,
hostname?, label?, currentVersion?, requestTimeoutMs, downloadIdleTimeoutMs?,
heartbeatIntervalMs?, installationStorePath?, retry? }`.

**The license key is read at runtime, not frozen at boot.** Production usually
ships `LICENSE_KEY` empty — the customer types their key into the activation
form and it lands in the key store on disk (`keyStorePath`, shared with
`LicenseClientModule`). `LICENSE_KEY_SOURCE` re-reads it on every call, so
re-activating with a different key takes effect without a restart. Before
activation the client reports `no_license_key` and keeps retrying; that is a
normal state for a freshly delivered install, not a misconfiguration.

`heartbeatIntervalMs` (0 = off) starts `InstallationHeartbeat`: one beat plus
one update check on a timer. It never blocks boot and never throws — a CMS
outage costs the vendor a stale row, not the customer a working site.

Service surface: `refresh({ maxAgeMs? })`, `getState()`, `heartbeat()`,
`startUpdate(releaseId)`, `downloadComponent(releaseId, component, { destDir })`,
`reportStep(jobId, { step, outcome, detail?, errorMessage? })`,
`abandonJob(jobId, reason)`, `getInstallationId()`.

**Errors are typed so callers can act on them**, rather than one "unreachable"
that hides why: `InstallationUnauthorizedError` (401 — re-register),
`InstallationForbiddenError` (403, with `code` — e.g. `updates_expired`: tell
the operator to renew, re-registering will not help),
`InstallationNotFoundError` (404), `UpdateConflictError` (409 — a job is
already running, or the release is not published), and
`InstallationAuthorityUnreachableError` for an actual failure to get an answer.
Only the last is retried.

**Retries are deliberate, not blanket.** `register`/`getUpdates`/`download` get
3 attempts with full-jitter backoff; `reportStep` gets 5 (losing a step
corrupts the vendor's only record of the job, and a lost `completed` leaves it
looking stuck forever); `heartbeat` gets none (the next beat *is* the retry);
`startUpdate` and `rotateToken` get none, because they are not idempotent and a
retry whose first attempt actually landed is indistinguishable from a real
conflict.

**Downloads stream to disk.** A component tarball is hashed while streaming
into a dot-prefixed `.part` file and renamed on success, so nothing large sits
resident in memory and a half-written file can never be mistaken for a verified
artifact. The timeout is an *idle* timeout, reset per chunk — a single deadline
covering the whole transfer would abort every real download.

**Verify before you unpack.** `startUpdate` returns `manifestToken`, an
Ed25519-signed inventory of the release. Check it with
`Ed25519ReleaseManifestVerifier` from `@cmsnt/license-sdk/core`, then
`assertComponentDigest` each downloaded file against it:

```ts
import {
  Ed25519ReleaseManifestVerifier, assertComponentDigest,
  assertManifestMatchesRelease, findManifestComponent,
} from '@cmsnt/license-sdk/core';

const manifest = new Ed25519ReleaseManifestVerifier(publicKey).verify(job.manifestToken!);
assertManifestMatchesRelease(manifest, releaseId);
const file = await updates.downloadComponent(releaseId, 'api', { destDir });
assertComponentDigest(findManifestComponent(manifest, 'api'), file);
```

A `manifestToken` of `null` means the CMS has no signing key configured.
**Treat that as a refusal, not a pass** — an attacker impersonating the CMS
would answer `null` too.

**Status endpoint stays in your app**, same as the license one:

```ts
@Controller('update')
export class UpdateStatusController {
  constructor(private readonly updates: UpdateClientService) {}
  @Get('status') @AdminAuth()
  async status() {
    const s = await this.updates.refresh({ maxAgeMs: 10_000 });
    return { updateAvailable: s.updateAvailable, currentVersion: s.currentVersion,
             latestVersion: s.latestVersion, reason: s.reason, updatesUntil: s.updatesUntil };
  }
}
```

> **Honest limits.** The SDK owns transport and verification; it does not
> unpack, build, migrate or restart anything. Those steps depend entirely on
> how a given product is deployed, so they belong to the product's own updater.
> Independent of `LicenseClientModule` by design: a dedicated updater process
> registers this alone and does not inherit a boot-blocking license gate, a
> second recheck timer, or a second verifier racing over the same token cache.

## `edge` — frontend / Next.js middleware

```ts
// packages/.../license-middleware.ts
import { checkLicense } from '@cmsnt/license-sdk/edge';

const result = await checkLicense({
  serverUrl: process.env.NEXT_PUBLIC_LICENSE_SERVER_URL!,
  licenseKey, domain,
  publicKey: process.env.NEXT_PUBLIC_LICENSE_PUBLIC_KEY, // SPKI PEM or base64
});
if (!result.valid) return NextResponse.rewrite(new URL('/license-invalid', req.url));
```

When a `publicKey` is set AND the server returns a signed `token`, the Ed25519
signature is authoritative (a forged server can't pass). Without a token it
falls back to the server's `valid` flag (rollout-safe). Also exports the lower
level `verifyLicenseToken(token, publicKey)`.

> **Edge runtime note:** verification uses Web Crypto `crypto.subtle` with
> `Ed25519`. Ensure your runtime supports it (Node 18+ and recent Next.js edge
> runtimes do).

## `next` — self-served activation middleware

When the license is invalid, the middleware **renders its own key-entry form**
(no page in your app source) and, on a valid submit, stores the key in an
httpOnly cookie **and** syncs it to the backend. After that sync, **any**
browser unlocks via `GET /license/status` — one operator activation covers the
whole install (no per-machine re-entry). The status helper unwraps a host
success envelope (`{ data: { valid } }`) and also accepts `{ success: true, valid }`
so Nest interceptors do not hide the flag. Your `middleware.ts` only calls the
factory:

```ts
// apps/<app>/middleware.ts
import { createLicenseMiddleware } from '@cmsnt/license-sdk/next';
import { NextResponse } from 'next/server';

const gate = createLicenseMiddleware({
  serverUrl: process.env.NEXT_PUBLIC_LICENSE_SERVER_URL!,
  licenseKey: process.env.NEXT_PUBLIC_LICENSE_KEY,       // build-time fallback
  publicKey: process.env.NEXT_PUBLIC_LICENSE_PUBLIC_KEY, // SDK also defaults to this
  // Optional: sync the accepted key to the backend (the REAL enforcement point):
  backendActivateUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/v1/license/activate`,
});

export async function middleware(req) {
  return (await gate(req)) ?? NextResponse.next();
}
export const config = { matcher: ['/((?!api|_next|_vercel|static|favicon.ico|.*\\..*).*)'] };
```

Key resolution order: activation **cookie** → `licenseKey` option →
`NEXT_PUBLIC_LICENSE_KEY` → (if still empty) **backend already licensed** via
`GET …/license/status` derived from `backendActivateUrl`. The submitted key is
verified (signature) before acceptance, so a bogus key can't unlock.

**Backend sync** — mount the public activation endpoints so the entered key also
reaches the real gate, and so other browsers unlock without a cookie:

```ts
LicenseClientModule.forRoot({ ...cfg.licenseClient, enableActivationEndpoint: true })
// exposes PUBLIC  POST /v1/license/activate  { licenseKey }  → { success: true, valid, fresh, reason }
//          PUBLIC  GET  /v1/license/status                   → { success: true, valid, fresh, reason }
// a valid key is persisted (keyStorePath, default .license/active-key) and adopted.
```

> **Honest limits.** FE checks are cosmetic (the strategy's real gate is the
> backend boot gate); the `createLicenseMiddleware` call still lives in the app's
> `middleware.ts`, so a source-editing customer can remove it — this *raises the
> cost*, it is not tamper-proof. Backend self-activation only works while the
> backend is running: with `enforce: true` and a hard-invalid license the process
> exits, so recover via env + redeploy. Run `enforce: false` during onboarding to
> allow runtime activation.

## Develop

```bash
pnpm build       # tsc -> dist (commit dist after changes)
```
