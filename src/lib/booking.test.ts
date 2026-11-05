import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBookingWindow,
  assertWithinOperatingHours,
  rangesOverlap,
} from "./booking";

test("booking time ranges overlap only when their half-open intervals intersect", () => {
  const start = new Date("2026-12-01T10:00:00.000Z");
  const end = new Date("2026-12-01T11:00:00.000Z");
  assert.equal(rangesOverlap(start, end, new Date("2026-12-01T11:00:00.000Z"), new Date("2026-12-01T12:00:00.000Z")), false);
  assert.equal(rangesOverlap(start, end, new Date("2026-12-01T10:59:00.000Z"), new Date("2026-12-01T12:00:00.000Z")), true);
});

test("booking windows must be future and between 30 minutes and 24 hours", () => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  assert.doesNotThrow(() => assertBookingWindow(start, new Date(start.getTime() + 30 * 60 * 1000)));
  assert.throws(() => assertBookingWindow(start, new Date(start.getTime() + 29 * 60 * 1000)));
});

test("operating-hour checks use the Asia/Bangkok timezone", () => {
  const hours = [{ weekday: 6, openTime: "08:00", closeTime: "22:00", isClosed: false }];
  assert.doesNotThrow(() =>
    assertWithinOperatingHours(
      new Date("2026-04-04T02:00:00.000Z"),
      new Date("2026-04-04T05:00:00.000Z"),
      hours,
    ),
  );
  assert.throws(() =>
    assertWithinOperatingHours(
      new Date("2026-04-04T15:00:00.000Z"),
      new Date("2026-04-04T16:00:00.000Z"),
      hours,
    ),
  );
});
