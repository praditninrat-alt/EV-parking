import { randomUUID } from "node:crypto";
import { ApiError } from "./api";
import { prisma } from "./db";

export function organizationBookingReminderWindow(now = new Date()) {
  return {
    startAt: now,
    endAt: new Date(now.getTime() + 10 * 60 * 1000),
  };
}

export async function listOrganizationBookings(
  range?: { startAt: Date; endAt: Date },
  options: { includeEnded?: boolean } = {},
) {
  const where = range
    ? {
        status: "CONFIRMED",
        startAt: { lt: range.endAt },
        endAt: { gt: range.startAt },
      }
    : {};
  const bookings = await prisma.organizationBooking.findMany({
    where,
    orderBy: { startAt: "asc" },
  });
  return options.includeEnded
    ? bookings
    : bookings.filter((booking) => booking.endAt > new Date());
}

export function listUpcomingOrganizationBookingReminders(now = new Date()) {
  const window = organizationBookingReminderWindow(now);
  return prisma.organizationBooking.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gt: window.startAt, lte: window.endAt },
      endAt: { gt: window.startAt },
    },
    orderBy: { startAt: "asc" },
    select: { id: true, startAt: true },
  });
}

export async function createOrganizationBooking(
  userId: string,
  employeeCode: string,
  startAt: Date,
  endAt: Date,
) {
  return prisma.$transaction(async (tx) => {
    await tx.organizationBookingMutex.upsert({
      where: { id: "charger" },
      create: { id: "charger" },
      update: { version: { increment: 1 } },
    });

    const conflict = await tx.organizationBooking.findFirst({
      where: {
        status: "CONFIRMED",
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ApiError(409, "CHARGER_UNAVAILABLE", "มีผู้จองหัวชาร์จในช่วงเวลานี้แล้ว กรุณาเลือกเวลาอื่น");
    }

    return tx.organizationBooking.create({
      data: {
        id: randomUUID(),
        reference: `ORG-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
        userId,
        employeeCode,
        startAt,
        endAt,
      },
    });
  });
}

export async function cancelOrganizationBooking(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.organizationBookingMutex.upsert({
      where: { id: "charger" },
      create: { id: "charger" },
      update: { version: { increment: 1 } },
    });

    const booking = await tx.organizationBooking.findUnique({ where: { id } });
    if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "ไม่พบรายการจอง");
    if (booking.status !== "CONFIRMED") {
      throw new ApiError(409, "BOOKING_NOT_CANCELLABLE", "รายการจองนี้ไม่สามารถยกเลิกได้");
    }
    if (booking.startAt <= new Date()) {
      throw new ApiError(409, "BOOKING_ALREADY_STARTED", "ไม่สามารถยกเลิกหลังเวลาเริ่มจอง");
    }
    return tx.organizationBooking.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  });
}
