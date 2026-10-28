/**
 * Prepares a development checkout: writes .env.local with fresh development
 * secrets and an embedded database, then migrates and seeds it.
 *
 *   npm run setup:dev
 *
 * Nothing secret is printed. Development keys are named dev-*, and release
 * builds of the installer refuse to trust them.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { flag } from "./load-env";
import { newSigningKey, pemForEnv, publicKeyring } from "./keys";

const root = process.cwd();
const envFile = path.join(root, ".env.local");
const dataDir = path.join(root, ".data");

if (existsSync(envFile) && !flag("force")) {
  console.log(".env.local already exists; keeping it. Use --force to replace it (this makes existing dev licenses invalid).");
} else {
  const appUrl = "http://localhost:3100";
  const kid = `dev-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const { privateKey, pem } = newSigningKey();
  const lines = [
    "# Development settings written by `npm run setup:dev`. Never use these in production.",
    "DATABASE_URL=pglite:./.data/dev",
    `APP_URL=${appUrl}`,
    "APP_NAME=License Server (development)",
    "TIME_ZONE=Asia/Karachi",
    `LICENSE_SIGNING_KID=${kid}`,
    `LICENSE_SIGNING_KEY="${pemForEnv(pem)}"`,
    `KEY_HMAC_SECRET=${randomBytes(32).toString("base64")}`,
    `KEY_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
    `SETUP_TOKEN=${randomBytes(24).toString("base64url")}`,
    "# Used by `npm run seed:dev` to create a development administrator.",
    "DEV_ADMIN_EMAIL=admin@example.com",
    `DEV_ADMIN_PASSWORD=${randomBytes(12).toString("base64url")}`,
    "",
  ];
  writeFileSync(envFile, lines.join("\n"), { mode: 0o600 });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, "dev-keyring.json"), `${JSON.stringify(publicKeyring(appUrl, kid, privateKey), null, 2)}\n`);
  console.log(`Wrote .env.local (signing key ${kid}) and .data/dev-keyring.json (its public key, for development builds).`);
}

console.log("Next: npm run seed:dev, then npm run dev and open http://localhost:3100");
