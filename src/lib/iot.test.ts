import { describe, expect, it } from "vitest";
import { autoFanState, autoLightState, powerDraw } from "./iot";

describe("auto fan rule", () => {
  it("turns on at the threshold", () => {
    expect(autoFanState(false, 28, 28)).toBe(true);
  });
  it("stays on within 1 °C below the threshold", () => {
    expect(autoFanState(true, 27.5, 28)).toBe(true);
  });
  it("turns off once more than 1 °C below the threshold", () => {
    expect(autoFanState(true, 26.9, 28)).toBe(false);
  });
});

describe("auto light rule", () => {
  it("turns on with motion in a dark room", () => {
    expect(autoLightState(true, 80, 150)).toBe(true);
  });
  it("stays off without motion", () => {
    expect(autoLightState(false, 80, 150)).toBe(false);
  });
  it("stays off when the room is bright", () => {
    expect(autoLightState(true, 300, 150)).toBe(false);
  });
});

describe("power draw", () => {
  it("adds fan and light load to the base load", () => {
    expect(powerDraw({ on: true, auto: false, level: 2 }, { on: true, auto: false, level: 50 })).toBe(85 + 36 + 6);
  });
});
