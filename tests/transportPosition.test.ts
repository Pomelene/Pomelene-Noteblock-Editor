import { describe, expect, it } from "vitest";
import { formatTransportPosition } from "../src/renderer/src/formatTransportPosition";

describe("transport position fields", () => {
  it.each([
    [0, "4/4", ["001", "01", "000"]],
    [0.09, "4/4", ["001", "01", "009"]],
    [0.99, "4/4", ["001", "01", "099"]],
    [1, "4/4", ["001", "01", "100"]],
    [3.1, "4/4", ["001", "01", "310"]],
    [4, "4/4", ["001", "02", "000"]],
    [16, "4/4", ["002", "01", "000"]],
    [11.99, "6/8", ["001", "06", "199"]],
    [12, "6/8", ["002", "01", "000"]],
    [7.99, "2/2", ["001", "01", "799"]],
    [8, "2/2", ["001", "02", "000"]],
    [15.99, "2/2", ["001", "02", "799"]],
    [16, "2/2", ["002", "01", "000"]],
    [15968, "4/4", ["999", "01", "000"]],
    [15984, "4/4", ["1000", "01", "000"]],
    [1_048_576, "1/16", ["1048577", "01", "000"]],
  ])(
    "formats tick %s in %s without losing tick precision",
    (tick, meter, fields) => {
      expect(formatTransportPosition(tick, meter)).toEqual(fields);
    },
  );
});
