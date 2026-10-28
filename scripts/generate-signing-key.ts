/**
 * Creates a production license signing key.
 *
 *   npm run keys:generate -- --issuer https://license.enerceon.com [--kid ls-2026-10]
 *
 * Writes, into .secrets/ (git-ignored):
 *   <kid>.pem          the private key: store it offline (password manager), then delete it here
 *   <kid>.env          LICENSE_SIGNING_KID and LICENSE_SIGNING_KEY, to paste into Vercel as Sensitive
 *   <kid>.keyring.json the public key, which products embed (copy it to <product>/licensing/keyring.json)
 *
 * The private key is never printed.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { argument, loadEnv } from "./load-env";
import { newSigningKey, pemForEnv, publicKeyring } from "./keys";

loadEnv();
const issuer = argument("issuer") ?? process.env.LICENSE_ISSUER ?? process.env.APP_URL;
if (!issuer || !/^https:\/\//.test(issuer)) {
  console.error("Give the production address: --issuer https://license.example.com");
  process.exit(1);
}
const kid = argument("kid") ?? `ls-${new Date().toISOString().slice(0, 7)}`;
if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid) || kid.startsWith("dev-")) {
  console.error("The key id must be 1-64 letters, digits, dots, dashes or underscores, and must not start with dev-.");
  process.exit(1);
}

const dir = path.join(process.cwd(), ".secrets");
mkdirSync(dir, { recursive: true });
const pemFile = path.join(dir, `${kid}.pem`);
if (existsSync(pemFile)) {
  console.error(`${path.relative(process.cwd(), pemFile)} already exists. Choose another --kid.`);
  process.exit(1);
}

const { privateKey, pem } = newSigningKey();
writeFileSync(pemFile, pem, { mode: 0o600 });
writeFileSync(path.join(dir, `${kid}.env`), `LICENSE_SIGNING_KID=${kid}\nLICENSE_SIGNING_KEY="${pemForEnv(pem)}"\n`, { mode: 0o600 });
const keyring = publicKeyring(issuer, kid, privateKey);
writeFileSync(path.join(dir, `${kid}.keyring.json`), `${JSON.stringify(keyring, null, 2)}\n`);

console.log(`Signing key ${kid} for ${issuer} written to .secrets/.`);
console.log("Public keyring (safe to share and commit):");
console.log(JSON.stringify(keyring, null, 2));
