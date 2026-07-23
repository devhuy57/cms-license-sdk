# @cmsnt/license-sdk

Reusable Ed25519 license SDK, shared across products. Three entrypoints:

| Import | Runtime | For |
|---|---|---|
| `@cmsnt/license-sdk/core` | Node (`node:crypto`) | License **server** (sign) + Node **backends** (verify) |
| `@cmsnt/license-sdk/nest` | NestJS | **Backend** enforcement client (verify + boot gate + heartbeat) |
| `@cmsnt/license-sdk/edge` | Web Crypto (`crypto.subtle`) | **Frontend** / edge (Next.js middleware, browser) verify |

A token is `base64url(claimsJSON).base64url(ed25519Signature)`. The raw license
key never travels — only its SHA-256 (`sub`). Only the license server holds the
private key; everything shipped to customers embeds the public key (verify-only).

## Install (git dependency)

```bash
pnpm add github:devhuy57/cms-license-sdk#v0.1.0
```

The package name (for imports) is `@cmsnt/license-sdk`; the git repo is
`devhuy57/cms-license-sdk`. `dist/` is committed, so no build step runs on install.

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

## Develop

```bash
pnpm build       # tsc -> dist (commit dist after changes)
```
