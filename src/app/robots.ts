import type { MetadataRoute } from "next";

/** Nothing here belongs in search results. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
