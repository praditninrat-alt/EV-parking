import assert from "node:assert/strict";
import test from "node:test";
import { bangkokDayBounds, getOrganizationChargingPoint } from "./organization";

test("organization schedule day bounds use Bangkok midnight and reject invalid dates", () => {
  const { startAt, endAt } = bangkokDayBounds("2026-11-04");
  assert.equal(startAt.toISOString(), "2026-11-03T17:00:00.000Z");
  assert.equal(endAt.toISOString(), "2026-11-04T17:00:00.000Z");
  assert.throws(() => bangkokDayBounds("2026-02-31"), { code: "INVALID_DATE" });
});

test("organization charging point is open from 08:00 to 18:00 every day", () => {
  const { operatingHours } = getOrganizationChargingPoint();
  assert.equal(operatingHours.length, 7);
  assert.ok(operatingHours.every((hours) => (
    hours.openTime === "08:00" && hours.closeTime === "18:00" && !hours.isClosed
  )));
});
