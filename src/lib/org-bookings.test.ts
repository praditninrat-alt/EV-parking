import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "./api";
import { prisma } from "./db";
import {
  cancelOrganizationBooking,
  createOrganizationBooking,
  listOrganizationBookings,
  organizationBookingReminderWindow,
} from "./org-bookings";

test("organization bookings reject overlaps but allow adjacent time slots", async () => {
  const startAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const createdIds: string[] = [];

  try {
    const booking = await createOrganizationBooking("admin", "EMP001", startAt, endAt);
    createdIds.push(booking.id);

    await assert.rejects(
      createOrganizationBooking("another-user", "EMP002", new Date(startAt.getTime() + 30 * 60 * 1000), endAt),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
    const adjacent = await createOrganizationBooking(
      "another-user",
      "EMP002",
      endAt,
      new Date(endAt.getTime() + 30 * 60 * 1000),
    );
    createdIds.push(adjacent.id);

    assert.equal((await listOrganizationBookings()).some((item) => item.id === booking.id), true);
    assert.equal(booking.employeeCode, "EMP001");
  } finally {
    await prisma.organizationBooking.deleteMany({ where: { id: { in: createdIds } } });
  }
});

test("cancelling an upcoming booking releases its time slot", async () => {
  const startAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const createdIds: string[] = [];

  try {
    const booking = await createOrganizationBooking("admin", "EMP001", startAt, endAt);
    createdIds.push(booking.id);
    await assert.rejects(
      cancelOrganizationBooking("unknown-booking"),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
    assert.equal((await cancelOrganizationBooking(booking.id)).status, "CANCELLED");
    const replacement = await createOrganizationBooking("another-user", "EMP002", startAt, endAt);
    createdIds.push(replacement.id);
  } finally {
    await prisma.organizationBooking.deleteMany({ where: { id: { in: createdIds } } });
  }
});

test("schedule queries include completed bookings while other lists hide them", async () => {
  const startAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const booking = await createOrganizationBooking("admin", "EMP003", startAt, endAt);

  try {
    const range = {
      startAt: new Date(startAt.getTime() - 1),
      endAt: new Date(endAt.getTime() + 1),
    };
    assert.equal((await listOrganizationBookings(range)).some((item) => item.id === booking.id), false);
    assert.equal(
      (await listOrganizationBookings(range, { includeEnded: true })).some((item) => item.id === booking.id),
      true,
    );
  } finally {
    await prisma.organizationBooking.delete({ where: { id: booking.id } });
  }
});

test("booking reminder window starts now and ends ten minutes later", () => {
  const now = new Date();
  const window = organizationBookingReminderWindow(now);
  assert.equal(window.startAt, now);
  assert.equal(window.endAt.getTime() - now.getTime(), 10 * 60 * 1000);
});

test.after(async () => {
  await prisma.organizationBookingMutex.deleteMany();
  await prisma.$disconnect();
});
