/**
 * Creates an administrator, or makes an existing account one, directly in the
 * database. For recovery, e.g. when every administrator is locked out.
 *
 *   DATABASE_URL=postgres://... npm run admin:create -- --email you@company.com --name "Your Name"
 *
 * The password is asked for without echoing it.
 */
import { createInterface } from "node:readline";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema";
import { recordEvent } from "../src/lib/audit";
import { newId } from "../src/lib/ids";
import { hashPassword, passwordProblems } from "../src/lib/passwords";
import { argument, loadEnv, run } from "./load-env";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput.bind(rl);
    let prompted = false;
    (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = (text: string) => {
      if (!prompted) {
        prompted = true;
        write(text);
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

run(async () => {
  loadEnv();
  const email = argument("email")?.trim().toLowerCase();
  const name = argument("name")?.trim() || "Administrator";
  if (!email || !email.includes("@") || !process.env.DATABASE_URL) {
    console.error('Usage: npm run admin:create -- --email you@company.com --name "Your Name"   (with DATABASE_URL set)');
    process.exit(1);
  }

  const password = await askHidden(`Password for ${email}: `);
  const problems = passwordProblems(password, { email, name });
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  if ((await askHidden("Again: ")) !== password) {
    console.error("The passwords differ.");
    process.exit(1);
  }

  const { db, close } = await createDatabase(process.env.DATABASE_URL);
  try {
    const passwordHash = await hashPassword(password);
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    const values = { name, passwordHash, role: "admin" as const, status: "active" as const, failedSignIns: 0, lockedUntil: null };
    if (existing) await db.update(users).set(values).where(eq(users.id, existing.id));
    else await db.insert(users).values({ id: newId("usr"), email, approvedAt: new Date(), approvedBy: "command line", ...values });
    await recordEvent(db, { type: "user.approved", actor: "command line", details: { user: email, role: "admin" } });
    console.log(`${email} is an active administrator.`);
  } finally {
    await close();
  }
});
