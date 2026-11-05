export type ScheduleBookingStatus = "waiting" | "charging" | "completed";

export function getScheduleBookingStatus(
  startAt: string,
  endAt: string,
  now: number | null,
): ScheduleBookingStatus {
  if (now === null || now < new Date(startAt).getTime()) return "waiting";
  if (now < new Date(endAt).getTime()) return "charging";
  return "completed";
}
