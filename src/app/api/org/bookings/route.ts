import { z } from "zod";
import { ApiError, assertSameOrigin, jsonError, parseBody } from "@/lib/api";
import { assertBookingWindow, assertWithinOperatingHours } from "@/lib/booking";
import { requireUser } from "@/lib/auth";
import { bangkokDayBounds, getOrganizationChargingPoint } from "@/lib/organization";
import {
  createOrganizationBooking,
  listOrganizationBookings,
  listUpcomingOrganizationBookingReminders,
} from "@/lib/org-bookings";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";

const bookingSchema = z.object({
  employeeCode: z.string().trim().min(2).max(32).transform((value) => value.toUpperCase()),
  startAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(30).max(24 * 60),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (request.nextUrl.searchParams.get("reminders") === "true") {
      return NextResponse.json({ data: await listUpcomingOrganizationBookingReminders() });
    }
    const mine = request.nextUrl.searchParams.get("mine") === "true";

    if (mine) {
      return NextResponse.json({
        data: (await listOrganizationBookings())
          .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
          .slice(0, 50)
          .map(({ id, reference, employeeCode, startAt, endAt, status }) => ({
            id,
            reference,
            employeeCode,
            startAt,
            endAt,
            status,
          })),
      });
    }

    const date = request.nextUrl.searchParams.get("date");
    if (!date) {
      throw new ApiError(400, "INVALID_DATE", "กรุณาระบุวันที่ในรูปแบบ YYYY-MM-DD");
    }
    const { startAt: dayStart, endAt: dayEnd } = bangkokDayBounds(date);
    const bookings = await listOrganizationBookings(
      { startAt: dayStart, endAt: dayEnd },
      { includeEnded: true },
    );

    return NextResponse.json({
      data: bookings.map((booking) => ({
        id: booking.id,
        reference: booking.reference,
        employeeCode: booking.employeeCode,
        startAt: booking.startAt,
        endAt: booking.endAt,
        isMine: true,
        status: booking.status,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    rateLimit(`org-booking:${user.id}`, 10, 60_000);
    const input = await parseBody(request, bookingSchema);
    const startAt = new Date(input.startAt);
    const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000);
    assertBookingWindow(startAt, endAt);
    const chargingPoint = getOrganizationChargingPoint();
    assertWithinOperatingHours(startAt, endAt, chargingPoint.operatingHours);
    const booking = await createOrganizationBooking(user.id, input.employeeCode, startAt, endAt);

    return NextResponse.json({
      data: { ...booking, totalPrice: 0 },
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
