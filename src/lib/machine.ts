/**
 * A computer's identity: hashed ids collected on the client by the shared
 * fingerprint routine (license-kit/shared/fingerprint.ps1). Each id is
 * base64url(SHA-256("fp1|PRODUCT|name|value")), so raw serial numbers never
 * leave the computer.
 */
export const MACHINE_ID_NAMES = ["board", "os", "disk"] as const;
export type MachineIdName = (typeof MACHINE_ID_NAMES)[number];
export type MachineIds = Partial<Record<MachineIdName, string>>;

/** The only fingerprint version so far. */
export const FINGERPRINT_VERSION = 1;

/**
 * Does `current` belong to the computer a license was issued for (`recorded`)?
 *
 * At least two of the recorded ids must match, or all of them when fewer than
 * two were available. The motherboard (or virtual machine) id, when it was
 * recorded, must always be among them: a disk moved into another computer keeps
 * its Windows and disk ids but not the motherboard.
 *
 * The same rule runs in the license SDK and in the installer; keep them equal.
 */
export function machineMatches(recorded: MachineIds, current: MachineIds): boolean {
  const names = MACHINE_ID_NAMES.filter((name) => recorded[name]);
  if (names.length === 0) return false;
  if (recorded.board && current.board !== recorded.board) return false;
  const matching = names.filter((name) => current[name] === recorded[name]).length;
  return matching >= Math.min(2, names.length);
}
