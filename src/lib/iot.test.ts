import { describe, expect, it } from "vitest";
import { autoFanState, autoLightState, findFieldValue, guessField, isTruthyField, parseDevicePayloads, powerDraw, resolveRelayInputs, relayAutoState } from "./iot";

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

describe("per-relay device inputs", () => {
  const reports = parseDevicePayloads('[{"Uid": 1, "Room Temp": 30, "Presence": true}, {"Uid": 2, "Light level": 3, "Room Temp": 20}]');
  const fallback = { temperature: 22, motion: false, lux: 300 };
  it("uses the chosen temperature device and flexible field name for each fan", () => {
    const hot = resolveRelayInputs({ temperature: { uid: 1, field: "room_temp" } }, reports, fallback);
    const cool = resolveRelayInputs({ temperature: { uid: 2, field: "ROOM TEMP" } }, reports, fallback);
    expect(relayAutoState("fan", false, 28, hot)).toBe(true);
    expect(relayAutoState("fan", true, 28, cool)).toBe(false);
  });
  it("gets each required light reading from an independently selected device", () => {
    const inputs = resolveRelayInputs({ motion: { uid: 1, field: "presence" }, lux: { uid: 2, field: "light_level" } }, reports, fallback);
    expect(inputs).toEqual({ temperature: 22, motion: true, lux: 3 });
    expect(relayAutoState("light", false, 150, inputs)).toBe(true);
  });
  it("does not fall back to simulation when selected data is missing", () => {
    const inputs = resolveRelayInputs({ temperature: { uid: 3, field: "Temperature" }, motion: { uid: 1, field: "missing" } }, reports, { temperature: 35, motion: true, lux: 3 });
    expect(relayAutoState("fan", true, 28, inputs)).toBe(false);
    expect(relayAutoState("light", true, 150, inputs)).toBe(false);
  });
  it("keeps a fan off for a nonnumeric selected temperature", () => {
    const inputs = resolveRelayInputs({ temperature: { uid: 1, field: "state" } }, parseDevicePayloads('{"Uid":1,"state":"online"}'), { temperature: 35 });
    expect(relayAutoState("fan", true, 28, inputs)).toBe(false);
  });
  it("retains simulation for unassigned required readings", () => {
    expect(resolveRelayInputs({}, reports, fallback)).toEqual(fallback);
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

describe("device-sourced relay thresholds", () => {
  it("compares fan readings against a chosen device threshold", () => {
    const reports = parseDevicePayloads('[{"Uid":1,"Temperature":30},{"Uid":2,"Fan limit":32}]');
    const inputs = resolveRelayInputs({ temperature: { uid: 1, field: "temperature" }, threshold: { uid: 2, field: "FAN_LIMIT" } }, reports, {});
    expect(inputs.threshold).toBe(32);
    expect(relayAutoState("fan", false, 28, inputs)).toBe(false);
    expect(relayAutoState("fan", false, 28, { ...inputs, threshold: 29 })).toBe(true);
  });
  it("compares light readings against the device threshold including zero", () => {
    const inputs = resolveRelayInputs({ threshold: { uid: 2, field: "limit" } }, parseDevicePayloads('{"Uid":2,"limit":0}'), { motion: true, lux: 3 });
    expect(inputs.threshold).toBe(0);
    expect(relayAutoState("light", false, 150, inputs)).toBe(false);
    expect(relayAutoState("light", false, 150, { ...inputs, threshold: 4 })).toBe(true);
  });
  it("keeps relays off if a chosen threshold is missing or not numeric", () => {
    for (const reports of [[], parseDevicePayloads('{"Uid":2,"limit":"online"}')]) {
      const inputs = resolveRelayInputs({ threshold: { uid: 2, field: "limit" } }, reports, { temperature: 35, motion: true, lux: 3 });
      expect(relayAutoState("fan", true, 28, inputs)).toBe(false);
      expect(relayAutoState("light", true, 150, inputs)).toBe(false);
    }
  });
  it("uses the entered threshold when no threshold source is chosen", () => {
    expect(relayAutoState("fan", false, 28, resolveRelayInputs({}, [], { temperature: 30 }))).toBe(true);
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

describe("data with any field names", () => {
  it("keeps field names that contain spaces and extra fields", () => {
    expect(parseDevicePayloads('{"Uid": 868225062598433, "Light level": 3, "Humidity": 15, "Temperature": 26}')).toEqual([
      { Uid: 868225062598433, values: { "Light level": 3, Humidity: 15, Temperature: 26 } },
    ]);
  });
  it("keeps text and boolean readings instead of dropping them", () => {
    expect(parseDevicePayloads('{"Uid": 7, "state": "online", "door": true, "batt": "3.7"}')).toEqual([
      { Uid: 7, values: { state: "online", door: 1, batt: 3.7 } },
    ]);
  });
  it("accepts a lowercase uid key", () => {
    expect(parseDevicePayloads('{"uid": 12, "Temp": 20}')).toEqual([{ Uid: 12, values: { Temp: 20 } }]);
  });
  it("finds a field whatever the name looks like", () => {
    const values = { "Light level": 3, Humidity: 15 };
    expect(findFieldValue(values, "lightlevel")).toBe(3);
    expect(findFieldValue(values, "LIGHT_LEVEL")).toBe(3);
    expect(findFieldValue(values, "light")).toBe(3);
    expect(findFieldValue(values, "missing")).toBeUndefined();
  });
  it("guesses the field a built-in sensor usually arrives as", () => {
    expect(guessField("lux", ["Humidity", "Light level"])).toBe("Light level");
    expect(guessField("humidity", ["Humidity", "Light level"])).toBe("Humidity");
    expect(guessField("temperature", ["Temp C"])).toBe("Temp C");
  });
  it("treats on/off text as a switch", () => {
    expect(isTruthyField("OFF")).toBe(false);
    expect(isTruthyField("online")).toBe(true);
    expect(isTruthyField(0)).toBe(false);
    expect(isTruthyField(12)).toBe(true);
  });
});

import { serverEventToPayload, parseDevicePayloads as parseP2 } from "./iot";
describe("home server events", () => {
  it("reads a single telemetry event", () => {
    expect(serverEventToPayload({ type: "telemetry", device_uid: "DEVICE_001", entity_name: "temperature", value: 28.5, ts: "t" }))
      .toEqual({ Uid: "DEVICE_001", ts: "t", values: { temperature: 28.5 } });
  });
  it("reads a snapshot with an entity list", () => {
    expect(serverEventToPayload({ type: "snapshot", device_uid: "FAN_1", entities: [{ name: "relay_1", value: true }, { name: "humidity", value: 60 }] })?.values)
      .toEqual({ relay_1: 1, humidity: 60 });
  });
  it("ignores events without readings", () => {
    expect(serverEventToPayload({ type: "device_status", device_uid: "X", status: "online" })).toBeNull();
  });
  it("accepts text device IDs in pasted data", () => {
    expect(parseP2('{"Uid": "DEVICE_001", "Temperature": 25}')[0]?.Uid).toBe("DEVICE_001");
  });
});
