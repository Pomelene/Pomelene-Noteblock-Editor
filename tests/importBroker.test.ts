import { expect, it } from "vitest";
import { ImportBroker } from "../src/main/importBroker";
import type { NbsImportSummary, ImportPrompt } from "../src/shared/model";
const summary = { fileName: "song.nbs" } as NbsImportSummary;
it("accepts only the matching import window and token, and closes its prompt once", async () => {
  const b = new ImportBroker();
  const sent: (ImportPrompt | null)[] = [];
  const pending = b.request(2, summary, (p) => sent.push(p));
  const id = sent[0]!.id;
  expect(() => b.respond(3, id, "smart")).toThrow();
  expect(() => b.respond(2, "stale", "smart")).toThrow();
  b.respond(2, id, "original");
  expect(await pending).toBe("original");
  expect(sent.at(-1)).toBeNull();
  expect(() => b.respond(2, id, "smart")).toThrow();
});
it("window closure cancels pending import and releases the broker", async () => {
  const b = new ImportBroker();
  let token = "";
  const pending = b.request(7, summary, (p) => {
    if (p) token = p.id;
  });
  expect(b.cancelFor(8)).toBe(false);
  expect(b.cancelFor(7)).toBe(true);
  expect(await pending).toBe("cancel");
  const next = b.request(8, summary, () => {});
  b.cancelFor(8);
  expect(await next).toBe("cancel");
  expect(token).toBeTruthy();
});
it("main-window closure cancels a preview owned by any editor", async () => {
  const b = new ImportBroker();
  const sent: (ImportPrompt | null)[] = [];
  const pending = b.request(99, summary, (p) => sent.push(p));
  expect(b.cancelPending()).toBe(true);
  expect(await pending).toBe("cancel");
  expect(sent.at(-1)).toBeNull();
  expect(b.cancelPending()).toBe(false);
});
