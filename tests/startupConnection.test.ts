import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("startup connection lifecycle", () => {
  it("reports initial host failure rather than leaving an unhandled rejection", async () => {
    const error = new Error("Host unavailable"),
      onError = vi.fn();
    vi.stubGlobal("window", {
      studio: {
        onSnapshot: () => () => {},
        getSnapshot: () => Promise.reject(error),
      },
    });
    const { connect } = await import("../src/renderer/src/store");
    const off = connect(onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    off();
  });
  it("does not accept a late initial snapshot after disconnect", async () => {
    let resolve!: (value: unknown) => void;
    const unsubscribe = vi.fn();
    vi.stubGlobal("window", {
      studio: {
        onSnapshot: () => unsubscribe,
        getSnapshot: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
    });
    const { connect, currentGeneration } = await import(
      "../src/renderer/src/store"
    );
    const off = connect();
    off();
    resolve({ generation: 99, revision: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(currentGeneration()).toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("can accept a host update after initial failure", async () => {
    let reject!: (error: Error) => void, receive!: (value: unknown) => void;
    const onError = vi.fn();
    vi.stubGlobal("window", {
      studio: {
        onSnapshot: (fn: typeof receive) => {
          receive = fn;
          return () => {};
        },
        getSnapshot: () =>
          new Promise((_, r) => {
            reject = r;
          }),
      },
    });
    const { connect, currentGeneration } = await import(
      "../src/renderer/src/store"
    );
    const off = connect(onError);
    reject(new Error("Transient failure"));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    receive({ generation: 2, revision: 1 });
    expect(currentGeneration()).toBe(2);
    off();
  });
  it("does not report a late failure after disconnect", async () => {
    let reject!: (error: Error) => void;
    const onError = vi.fn();
    vi.stubGlobal("window", {
      studio: {
        onSnapshot: () => () => {},
        getSnapshot: () =>
          new Promise((_, r) => {
            reject = r;
          }),
      },
    });
    const { connect } = await import("../src/renderer/src/store");
    const off = connect(onError);
    off();
    reject(new Error("Host closed"));
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).not.toHaveBeenCalled();
  });
  it("reports a synchronously unavailable preload bridge", async () => {
    const error = new Error("Bridge unavailable"),
      onError = vi.fn();
    vi.stubGlobal("window", {
      studio: {
        onSnapshot: () => () => {},
        getSnapshot: () => {
          throw error;
        },
      },
    });
    const { connect } = await import("../src/renderer/src/store");
    const off = connect(onError);
    expect(onError).toHaveBeenCalledWith(error);
    off();
  });
});
