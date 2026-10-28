import { describe, expect, it } from "vitest";
import { machineMatches } from "@/lib/machine";

const recorded = { board: "B", os: "O", disk: "D" };

describe("machine matching (fingerprint version 1)", () => {
  // The table in DESIGN.md section 4.3.
  it.each([
    ["same computer", { board: "B", os: "O", disk: "D" }, true],
    ["Windows reinstalled", { board: "B", os: "O2", disk: "D" }, true],
    ["disk cloned onto a new disk", { board: "B", os: "O", disk: "D2" }, true],
    ["disk replaced and Windows reinstalled", { board: "B", os: "O2", disk: "D2" }, false],
    ["folder copied to another computer", { board: "B2", os: "O2", disk: "D2" }, false],
    ["disk moved into another computer", { board: "B2", os: "O", disk: "D" }, false],
    ["VM cloned with a new identity", { board: "B2", os: "O", disk: "D" }, false],
    ["disk serial unreadable now", { board: "B", os: "O" }, true],
    ["only the board readable now", { board: "B" }, false],
  ])("%s", (_, current, expected) => {
    expect(machineMatches(recorded, current)).toBe(expected);
  });

  it("needs every id when fewer than two were recorded", () => {
    expect(machineMatches({ os: "O" }, { os: "O", disk: "D" })).toBe(true);
    expect(machineMatches({ os: "O" }, { os: "O2", disk: "D" })).toBe(false);
  });

  it("without a recorded board, any two ids do", () => {
    expect(machineMatches({ os: "O", disk: "D" }, { board: "B", os: "O", disk: "D" })).toBe(true);
    expect(machineMatches({ os: "O", disk: "D" }, { board: "B", os: "O", disk: "D2" })).toBe(false);
  });

  it("never matches an empty record", () => {
    expect(machineMatches({}, {})).toBe(false);
    expect(machineMatches({}, recorded)).toBe(false);
  });
});
