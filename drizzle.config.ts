import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes a new SQL migration to ./drizzle after
// src/db/schema.ts changes. Commit the generated files.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
