import { licenseIssuer } from "@/lib/env";
import { publicSigningJwk } from "@/lib/license-token";

/**
 * GET /api/v1/keys: the issuer and its public signing key (a JWK set). Product
 * builds compare this with the keyring they embed, so a build never ships
 * with a key this server does not sign with.
 */
export async function GET() {
  return Response.json(
    { issuer: licenseIssuer(), keys: [publicSigningJwk()] },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
