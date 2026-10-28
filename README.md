# License Server

Activates software licenses and gives the publisher's staff a dashboard to manage them. One server
licenses any number of products. ENERCEON is the first.

- **Activation API.** An installer sends a license key and a fingerprint of the computer. The
  server binds the key to that computer and returns a signed license file. The same computer can
  activate again without using another place; other computers are refused once the key's places
  are taken.
- **Offline activation** at `/offline`, for computers without internet.
- **Dashboard** at `/admin`: customers, licenses, keys, computers, audit log and team. Staff request
  access themselves and an administrator approves them. Nothing is sent by e-mail.

Design: `BillingApp/license-kit/DESIGN.md`. Products verify license files with the license kit
(`BillingApp/license-kit`).

## How it works

| Part | Choice |
|---|---|
| Framework | Next.js 16 (App Router) on Vercel, Node.js runtime |
| Database | Postgres (Neon) through Drizzle ORM; an embedded Postgres (PGlite) for development and tests |
| License files | Compact JWS signed with ES256 (ECDSA P-256), `typ: license+jwt`. Products embed the public key. |
| License keys | `ENRC-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`: 120 random bits plus a check character. Stored as an HMAC (for lookup) and AES-256-GCM (so an admin can show it again), never in the clear. |
| Dashboard sign-in | E-mail and password (scrypt), sessions in the database, 8-hour `__Host-` cookies, lockout after 5 wrong passwords, approval by an administrator |
| Abuse limits | Per network address: 30 activation attempts an hour, 10 unknown keys an hour; sign-in and sign-up limits |
| Audit | Every activation (accepted or refused) and every staff action, with who, when and from where |

Roles: **admin** (everything, including products, team, revoking and revealing keys), **support**
(customers and licenses: issue, edit, reset computers, suspend), **viewer** (read only).

## Local development

Needs Node.js 22 or later.

```bash
npm install
npm run setup:dev   # writes .env.local with development secrets (nothing is printed)
npm run seed:dev    # ENERCEON product, a demo license, and an admin from .env.local
npm run dev         # http://localhost:3100
```

Sign in with `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` from `.env.local`. The demo license key is
in `.data/dev-license-key.txt`. The development database lives in `.data/dev`; stop `npm run dev`
before running `seed:dev` (the embedded database allows one process at a time).

| Command | Does |
|---|---|
| `npm test` | Unit and database tests (in-memory Postgres) |
| `npm run typecheck`, `npm run lint` | Static checks |
| `npm run build` | Production build (needs no secrets) |
| `npm run db:generate` | New migration in `drizzle/` after changing `src/db/schema.ts`; commit it |
| `npm run db:migrate` | Applies migrations to `DATABASE_URL` |

Development signing keys are named `dev-*`. Release builds of the installer refuse to trust them.

## Deploying (Vercel + Neon, at license.enerceon.com)

Do this once. Use a separate Vercel project from the company website.

1. **Repository.** Push this folder to its own Git repository and import it in Vercel
   (framework: Next.js). Vercel's Hobby plan is for non-commercial use; a license server for
   software you sell needs the Pro plan.
2. **Database.** In the Vercel project, open Storage and add **Neon Postgres**. It sets
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. Pick the region closest to your customers (for
   Pakistan: Mumbai, or Frankfurt) and set the Vercel functions to the same region (Settings >
   Functions).
3. **Secrets.** On your own computer, in this folder, once:
   ```powershell
   npm run prepare:production -- --url https://license.enerceon.com --name "ENERCEON License Server"
   ```
   It writes three files to `.secrets\` and prints no secret:
   - `production.env`: every setting except the database (`APP_URL`, `APP_NAME`, `TIME_ZONE`,
     the signing key, `KEY_HMAC_SECRET`, `KEY_ENCRYPTION_KEY`, `SETUP_TOKEN`).
   - `<kid>.pem`: the private signing key. Whoever holds it can make license files.
   - `<kid>.keyring.json`: the public key. Copy it to `BillingApp\licensing\keyring.json` (and
     each other licensed product's) so product builds trust it.

   Keep a copy of `production.env` and the `.pem` somewhere safe and offline (a password manager,
   or an encrypted USB stick). `KEY_HMAC_SECRET` and `KEY_ENCRYPTION_KEY` can never change: the
   stored license keys depend on them.
4. **Settings in Vercel:** Settings > Environment Variables > **Import .env**, paste the contents
   of `production.env`, choose **Production** only, and mark the secret ones **Sensitive**.
   Optionally add `SIGNUP_ALLOWED_DOMAINS` (your staff's e-mail domains, comma-separated; empty
   lets anyone request access, and an administrator still approves).

5. **Migrate**, from your computer, with the direct connection string from Neon (PowerShell):
   ```powershell
   $env:DATABASE_URL_UNPOOLED = "postgres://..."; npm run db:migrate
   ```
   Repeat this before deploying any version that adds a migration in `drizzle/`.
6. **Domain.** In Vercel: Settings > Domains > add `license.enerceon.com`. Vercel shows a
   CNAME value. In Bluehost: Domains > `enerceon.com` > DNS > add a **CNAME** record, host
   `license`, pointing to that value (add the `_vercel` TXT record too if Vercel asks for one).
   Vercel issues the HTTPS certificate once the record is visible, usually within minutes. The
   landing page at `enerceon.com` and `www` are not affected.
7. **First administrator.** Open `https://license.enerceon.com/setup`, enter the
   `SETUP_TOKEN`, and create your account. Then delete `SETUP_TOKEN` from Vercel and redeploy;
   `/setup` disappears once an administrator exists either way.
8. **Products.** In the dashboard, Products > add `ENERCEON`, code `ENERCEON`, key prefix `ENRC`.
   Codes and prefixes cannot change later.

Check it: `https://license.enerceon.com/api/v1/health` answers `{"status":"ok"}`, and
`/api/v1/keys` shows the public key from step 3.

## Running it

- **Issuing a key:** Licenses > New license, choose product and customer, copy the key and send it
  to the customer (WhatsApp, e-mail, letter). Only administrators can show it again later.
- **A customer replaces a computer:** open the license, **Reset** the old computer with a reason,
  and the customer activates the new one with the same key. In phase 1 the old computer keeps its
  license file; periodic checks (phase 2) will end that.
- **New staff:** they request access at `/auth/sign-up`; approve them on the Team page with a role.
- **Forgotten password:** Team > Password reset link, then send the link yourself. It works once,
  for 24 hours.
- **Locked out completely** (PowerShell):
  `$env:DATABASE_URL = "postgres://..."; npm run admin:create -- --email you@vizualtechs.com --name "Your Name"`.
- **Backups:** Neon keeps point-in-time history (a few days on the free plan, longer on paid
  plans). For a monthly offline copy: `pg_dump "<direct connection string>" > license-backup.sql`.

### Changing the signing key

Do it only if the private key may have leaked, or on a schedule you choose (e.g. every few years).

1. `npm run keys:generate -- --issuer https://license.enerceon.com --kid ls-YYYY-MM`.
2. Add the new public key to each product's `licensing\keyring.json` **next to** the old one,
   and ship product updates.
3. When customers have the updated products, switch `LICENSE_SIGNING_KID` and
   `LICENSE_SIGNING_KEY` in Vercel to the new key. New license files use it; old ones stay valid
   as long as products keep the old public key in their keyring.

## API

`POST /api/v1/activations` (public; the key is the credential), `Content-Type: application/json`:

```json
{
  "product": "ENERCEON",
  "key": "ENRC-7XK2Q-9MDPF-H3W8R-ZB6TN-4QJ8V",
  "machine": {
    "fpv": 1,
    "ids": { "board": "<43-char hash>", "os": "<43-char hash>", "disk": "<43-char hash>" },
    "name": "SERVER-01",
    "windows": "Windows Server 2022 (20348)"
  },
  "app": { "version": "1.1.0" },
  "installationId": "4f1c..."
}
```

- `201` (new activation) or `200` (this computer already had one):
  `{ "license": "<JWS>", "licenseId", "activationId", "customer", "reused" }`.
- Errors are `application/problem+json` with a `code` to branch on and a `detail` to show the
  person installing: `BAD_REQUEST` 400, `KEY_MALFORMED` 400, `MACHINE_UNIDENTIFIED` 400,
  `KEY_INVALID` 404, `PRODUCT_UNKNOWN` 404, `KEY_WRONG_PRODUCT` 403, `KEY_SUSPENDED` 403,
  `KEY_REVOKED` 403, `ACTIVATION_LIMIT` 409 (with `activations: [{ computer, activatedAt }]`),
  `RATE_LIMITED` 429 (with `Retry-After`), 413, 415.

`GET /api/v1/keys`: `{ issuer, keys: [JWK] }`, the public signing key.
`GET /api/v1/health`: `{ status: "ok" }`, or 503 when the database is unreachable.

License file claims: `iss`, `aud` (product code), `sub` (license id), `jti` (activation id),
`iat`, `ver` 1, `kind` (`perpetual`), `cus { id, name }`, `key` (`ENRC-...-4QJ8V`),
`mch { fpv, ids, name }`. The offline request format is described in `src/lib/offline.ts`.
