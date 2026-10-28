/** Date display for the dashboard, in TIME_ZONE (e.g. Asia/Karachi), UTC when unset or invalid. */
function timeZone(): string {
  const zone = process.env.TIME_ZONE;
  if (!zone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timeZone() }).format(new Date(value));
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: timeZone() }).format(new Date(value));
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
