import { describe, expect, it } from "vitest";
import { autoFanState, autoLightState, findFieldValue, guessField, isTruthyField, parseDevicePayloads, powerDraw } from "./iot";

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
    expect(powerDraw([{ on: true, auto: false, level: 2 }], [{ on: true, auto: false, level: 50 }])).toBe(85 + 36 + 6);
  });
  it("adds up every fan and light that is on", () => {
    const off = { on: false, auto: false, level: 3 };
    expect(powerDraw([{ on: true, auto: false, level: 1 }, { on: true, auto: false, level: 3 }, off], [off])).toBe(85 + 18 + 54);
  });
});

describe("device payload", () => {
  it("parses the documented format", () => {
    expect(parseDevicePayloads('{"Uid": 868225062598432, "Temperature": 25, "Humidity": 15}')).toEqual([{ Uid: 868225062598432, values: { Temperature: 25, Humidity: 15 } }]);
  });
  it("keeps the optional ts and any extra numeric fields", () => {
    expect(parseDevicePayloads('{"Uid": 1, "Temperature": 25, "CO2": 600, "ts": "10:00"}')).toEqual([{ Uid: 1, ts: "10:00", values: { Temperature: 25, CO2: 600 } }]);
  });
  it("accepts several comma-separated objects", () => {
    expect(parseDevicePayloads('{"Uid": 1, "Temperature": 25}, {"Uid": 2, "Humidity": 15},')).toHaveLength(2);
  });
  it("rejects payloads without a Uid", () => {
    expect(parseDevicePayloads('{"Temperature": 25}')).toEqual([]);
  });
});
