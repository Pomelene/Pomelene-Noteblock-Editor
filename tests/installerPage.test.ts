import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const installerScript = readFileSync(
  join(process.cwd(), "resources", "installer.nsh"),
  "utf8",
);

function macroBody(name: string): string {
  const match = installerScript.match(
    new RegExp(`!macro\\s+${name}\\s*([\\s\\S]*?)!macroend`, "i"),
  );
  if (!match) throw new Error(`Missing NSIS macro: ${name}`);
  return match[1];
}

function functionBody(name: string): string {
  const match = installerScript.match(
    new RegExp(`Function\\s+${name}\\s*([\\s\\S]*?)FunctionEnd`, "i"),
  );
  if (!match) throw new Error(`Missing NSIS function: ${name}`);
  return match[1];
}

describe("installer directory validation", () => {
  it("prepares and validates a /D target during initialization only for silent installs", () => {
    const body = macroBody("customInit");
    const prepareAt = body.search(/Call\s+PomelenePrepareDirectory/i);
    const validateAt = body.search(/Call\s+PomeleneValidateDirectory/i);

    expect(body).toMatch(/\$\{If\}\s+\$\{Silent\}|\bIfSilent\b/i);
    expect(prepareAt).toBeGreaterThanOrEqual(0);
    expect(validateAt).toBeGreaterThan(prepareAt);
  });

  it("validates after the directory page before installation proceeds", () => {
    expect(macroBody("customPageAfterChangeDir")).toMatch(
      /Page\s+custom\s+PomeleneValidateSelectedDirectory/i,
    );
  });

  it("creates the product subdirectory under the selected parent before validating", () => {
    const body = functionBody("PomeleneValidateSelectedDirectory");
    const prepareAt = body.search(/Call\s+PomelenePrepareDirectory/i);
    const validateAt = body.search(/Call\s+PomeleneValidateDirectory/i);

    expect(prepareAt).toBeGreaterThanOrEqual(0);
    expect(validateAt).toBeGreaterThan(prepareAt);
  });
});
