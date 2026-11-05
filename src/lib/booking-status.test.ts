import assert from "node:assert/strict";
import test from "node:test";
import { getScheduleBookingStatus } from "./booking-status";

const startAt = "2026-11-04T09:00:00.000Z";
const endAt = "2026-11-04T10:00:00.000Z";
const startTime = new Date(startAt).getTime();
const endTime = new Date(endAt).getTime();

test("schedule status is waiting before the booking starts", () => {
  assert.equal(getScheduleBookingStatus(startAt, endAt, startTime - 1), "waiting");
  assert.equal(getScheduleBookingStatus(startAt, endAt, null), "waiting");
});

test("schedule status is charging from start until end time", () => {
  assert.equal(getScheduleBookingStatus(startAt, endAt, startTime), "charging");
  assert.equal(getScheduleBookingStatus(startAt, endAt, endTime - 1), "charging");
});

test("schedule status is completed at and after the end time", () => {
  assert.equal(getScheduleBookingStatus(startAt, endAt, endTime), "completed");
  assert.equal(getScheduleBookingStatus(startAt, endAt, endTime + 1), "completed");
});
