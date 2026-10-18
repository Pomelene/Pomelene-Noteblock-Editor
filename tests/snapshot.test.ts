import { expect, it } from "vitest";
import { acceptsSnapshot } from "../src/renderer/src/store";
import { Session } from "../src/shared/session";
it("does not roll back to a stale project generation or revision from a delayed IPC result", () => {
  const s = new Session().snapshot();
  const current = { ...s, generation: 3, revision: 20 };
  expect(acceptsSnapshot({ ...s, generation: 2, revision: 21 }, current)).toBe(
    false,
  );
  expect(acceptsSnapshot({ ...s, generation: 3, revision: 19 }, current)).toBe(
    false,
  );
  expect(acceptsSnapshot({ ...s, generation: 3, revision: 20 }, current)).toBe(
    true,
  );
  expect(acceptsSnapshot({ ...s, generation: 4, revision: 21 }, current)).toBe(
    true,
  );
});
it("retains originating document generation across an awaited editor operation", async () => {
  const { execute } = await import("../src/renderer/src/store");
  let received: unknown;
  const studio = {
    dispatch: async (_c: unknown, generation?: number) => {
      received = generation;
      return new Session().snapshot();
    },
  };
  const { vi } = await import("vitest");
  vi.stubGlobal("window", { studio });
  try {
    await execute({ type: "undo" }, 7);
    expect(received).toBe(7);
  } finally {
    vi.unstubAllGlobals();
  }
});
