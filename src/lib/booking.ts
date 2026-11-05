import { ApiError } from "./api";

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

export function assertBookingWindow(startAt: Date, endAt: Date): void {
  const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
  if (!Number.isFinite(durationMinutes) || durationMinutes < 30 || durationMinutes > 24 * 60) {
    throw new ApiError(400, "INVALID_BOOKING_WINDOW", "ระยะเวลาจองต้องอยู่ระหว่าง 30 นาทีถึง 24 ชั่วโมง");
  }
  if (startAt <= new Date()) {
    throw new ApiError(400, "BOOKING_IN_PAST", "เวลาเริ่มจองต้องเป็นเวลาในอนาคต");
  }
}

export function localWeekdayAndMinute(date: Date): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = weekdays.indexOf(get("weekday") ?? "");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { weekday, minute: hour * 60 + minute };
}

export function assertWithinOperatingHours(
  startAt: Date,
  endAt: Date,
  hours: { weekday: number; openTime: string; closeTime: string; isClosed: boolean }[],
): void {
  const start = localWeekdayAndMinute(startAt);
  const end = localWeekdayAndMinute(new Date(endAt.getTime() - 1));
  const operatingHour = hours.find((item) => item.weekday === start.weekday);
  const parseMinutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  if (
    !operatingHour ||
    operatingHour.isClosed ||
    end.weekday !== start.weekday ||
    start.minute < parseMinutes(operatingHour.openTime) ||
    end.minute >= parseMinutes(operatingHour.closeTime)
  ) {
    throw new ApiError(400, "OUTSIDE_OPERATING_HOURS", "ช่วงเวลาที่เลือกอยู่นอกเวลาเปิดให้บริการ");
  }
}
