import { loadEnvConfig } from "@next/env";

/** Loads .env, .env.local etc. the way `next dev` does, for scripts run with tsx. */
export function loadEnv(): void {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
}

export function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Runs a script's main function, reporting failures with an exit code. */
export function run(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
