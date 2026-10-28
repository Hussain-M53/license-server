/**
 * Creates every secret a production deployment needs, once:
 *
 *   npm run prepare:production -- --url https://license.example.com [--name "Example License Server"] [--time-zone Asia/Karachi]
 *
 * Writes, into .secrets/ (git-ignored), and prints none of the secrets:
 *   production.env      all settings except the database: paste it into Vercel
 *                       (Settings > Environment Variables > Import .env), Production only
 *   <kid>.pem           the license signing key: keep an offline copy, then delete it here
 *   <kid>.keyring.json  its public key, which products embed (<product>/licensing/keyring.json)
 *
 * Refuses to run again while production.env exists: new secrets would make
 * every stored key and every issued license unusable.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { argument, run } from "./load-env";
import { newSigningKey, pemForEnv, publicKeyring } from "./keys";

run(async () => {
  const url = argument("url")?.replace(/\/+$/, "");
  if (!url || !/^https:\/\/[^/\s]+$/.test(url)) {
    console.error('Give the public address: npm run prepare:production -- --url https://license.example.com');
    process.exit(1);
  }
  const name = argument("name") ?? "License Server";
  const timeZone = argument("time-zone") ?? "Asia/Karachi";
  const kid = argument("kid") ?? `ls-${new Date().toISOString().slice(0, 7)}`;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid) || kid.startsWith("dev-")) {
    console.error("The key id must be 1-64 letters, digits, dots, dashes or underscores, and must not start with dev-.");
    process.exit(1);
  }

  const dir = path.join(process.cwd(), ".secrets");
  const envFile = path.join(dir, "production.env");
  if (existsSync(envFile)) {
    console.error(".secrets/production.env already exists. Its secrets are probably in use; delete it only if they are not.");
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });

  const { privateKey, pem } = newSigningKey();
  writeFileSync(path.join(dir, `${kid}.pem`), pem, { mode: 0o600 });
  const keyring = publicKeyring(url, kid, privateKey);
  writeFileSync(path.join(dir, `${kid}.keyring.json`), `${JSON.stringify(keyring, null, 2)}\n`);

  const lines = [
    `# Production settings for ${url}, created ${new Date().toISOString().slice(0, 10)}.`,
    "# Paste into Vercel > Settings > Environment Variables (Import .env), Production only,",
    "# and mark the secrets Sensitive. DATABASE_URL comes from the Neon integration.",
    `APP_URL=${url}`,
    `APP_NAME=${name}`,
    `TIME_ZONE=${timeZone}`,
    `LICENSE_SIGNING_KID=${kid}`,
    `LICENSE_SIGNING_KEY="${pemForEnv(pem)}"`,
    `KEY_HMAC_SECRET=${randomBytes(32).toString("base64")}`,
    `KEY_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
    `SETUP_TOKEN=${randomBytes(24).toString("base64url")}`,
    "",
  ];
  writeFileSync(envFile, lines.join("\n"), { mode: 0o600 });

  console.log(`Created .secrets/production.env, .secrets/${kid}.pem and .secrets/${kid}.keyring.json.`);
  console.log("No secret was printed. Public keyring (safe to share and commit):");
  console.log(JSON.stringify(keyring, null, 2));
});
