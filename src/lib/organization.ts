import { ApiError } from "@/lib/api";

export function bangkokDayBounds(date: string): { startAt: Date; endAt: Date } {
  const calendarDay = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(calendarDay.getTime()) ||
    calendarDay.toISOString().slice(0, 10) !== date
  ) {
    throw new ApiError(400, "INVALID_DATE", "วันที่ไม่ถูกต้อง");
  }
  const startAt = new Date(`${date}T00:00:00.000+07:00`);
  return { startAt, endAt: new Date(startAt.getTime() + 24 * 60 * 60 * 1000) };
}

export function getOrganizationChargingPoint() {
  const powerKw = Number(process.env.ORG_CHARGER_POWER_KW ?? "0");
  if (!Number.isFinite(powerKw) || powerKw < 0) {
    throw new ApiError(500, "INVALID_CHARGER_POWER", "กำลังไฟหัวชาร์จใน .env ไม่ถูกต้อง");
  }
  return {
    id: process.env.ORG_STATION_ID?.trim() || "organization-station",
    name: process.env.ORG_STATION_NAME?.trim() || "จุดชาร์จของบริษัท",
    address: process.env.ORG_STATION_ADDRESS?.trim() || "จุดชาร์จส่วนกลาง",
    district: "",
    province: "",
    operatingHours: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      openTime: "08:00",
      closeTime: "18:00",
      isClosed: false,
    })),
    charger: {
      id: process.env.ORG_CHARGER_ID?.trim() || "organization-charger",
      code: process.env.ORG_CHARGER_CODE?.trim() || "C1",
      connector: process.env.ORG_CHARGER_CONNECTOR?.trim() || "ไม่ระบุ",
      powerKw,
    },
  };
}
