import { generateKeyPairSync, randomBytes } from "node:crypto";

// Fresh throwaway secrets for every test run; nothing here is ever used for real licenses.
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

Object.assign(process.env, {
  DATABASE_URL: "pglite:memory",
  APP_URL: "http://localhost:3100",
  LICENSE_SIGNING_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  LICENSE_SIGNING_KID: "test-1",
  KEY_HMAC_SECRET: randomBytes(32).toString("base64"),
  KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  SETUP_TOKEN: randomBytes(24).toString("base64url"),
});
