"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getScheduleBookingStatus } from "@/lib/booking-status";

type User = {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
};

type ChargingPoint = {
  id: string;
  name: string;
  address: string;
  district: string;
  province: string;
  operatingHours: {
    weekday: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }[];
  charger: {
    id: string;
    code: string;
    connector: string;
    powerKw: number;
  };
};

type Booking = {
  id: string | null;
  reference: string | null;
  employeeCode: string | null;
  startAt: string;
  endAt: string;
  status: string;
  isMine?: boolean;
};

type BookingReminder = {
  id: string;
  startAt: string;
};

type ApiResponse<T> = { data: T } | { error: { code: string; message: string } };

const SHOWN_REMINDERS_KEY = "evpark-shown-booking-reminders";
const shownReminderIds = new Set<string>();

function getShownReminderIds(): Set<string> {
  const ids = new Set(shownReminderIds);
  try {
    const stored = JSON.parse(window.localStorage.getItem(SHOWN_REMINDERS_KEY) ?? "{}") as Record<string, number>;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [id, shownAt] of Object.entries(stored)) {
      if (typeof shownAt === "number" && shownAt >= cutoff) {
        ids.add(id);
        shownReminderIds.add(id);
      }
    }
  } catch (cause) {
    console.error("Could not read reminder history", cause);
  }
  return ids;
}

function saveShownReminder(id: string) {
  shownReminderIds.add(id);
  try {
    const stored = JSON.parse(window.localStorage.getItem(SHOWN_REMINDERS_KEY) ?? "{}") as Record<string, number>;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = Object.fromEntries(
      Object.entries(stored).filter(([, shownAt]) => typeof shownAt === "number" && shownAt >= cutoff),
    );
    recent[id] = Date.now();
    window.localStorage.setItem(SHOWN_REMINDERS_KEY, JSON.stringify(recent));
  } catch (cause) {
    console.error("Could not save reminder history", cause);
  }
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || "error" in result) {
    if ("error" in result) {
      throw new ApiRequestError(result.error.message, response.status, result.error.code);
    }
    throw new ApiRequestError("ไม่สามารถเชื่อมต่อระบบได้", response.status, "REQUEST_FAILED");
  }
  return result.data;
}

function bangkokParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function defaultBookingStart() {
  const now = new Date();
  const nextHalfHour = new Date(now.getTime() + (30 - (now.getMinutes() % 30)) * 60_000);
  const parts = bangkokParts(nextHalfHour);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function todayInBangkok() {
  const parts = bangkokParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatThaiDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(date));
}

function formatBookingDate(date: string) {
  const parts = bangkokParts(new Date(date));
  return formatThaiDate(`${parts.year}-${parts.month}-${parts.day}`);
}

function formatBookingStatus(status: string) {
  const labels: Record<string, string> = {
    PENDING: "รอยืนยัน",
    CONFIRMED: "ยืนยันแล้ว",
    CANCELLED: "ยกเลิกแล้ว",
    COMPLETED: "เสร็จสิ้น",
    EXPIRED: "หมดอายุ",
  };
  return labels[status] ?? status;
}

function BoltMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "org-brand-mark small" : "org-brand-mark"} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="m13.5 2-8 11h6l-.8 9 8-12h-6l.8-8Z" />
      </svg>
    </span>
  );
}

export default function OrganizationApp() {
  const initialStart = useMemo(defaultBookingStart, []);
  const [user, setUser] = useState<User | null>(null);
  const [point, setPoint] = useState<ChargingPoint | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [view, setView] = useState<"schedule" | "mine">("schedule");
  const [employeeCode, setEmployeeCode] = useState("");
  const [bookingEmployeeCode, setBookingEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [date, setDate] = useState(initialStart.date);
  const [time, setTime] = useState(initialStart.time);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reminders, setReminders] = useState<BookingReminder[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(Date.now());
    updateCurrentTime();
    const interval = window.setInterval(updateCurrentTime, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const refreshBookings = useCallback(async () => {
    if (!user) return;
    const url = view === "mine"
      ? "/api/org/bookings?mine=true"
      : `/api/org/bookings?date=${encodeURIComponent(date)}`;
    setBookings(await request<Booking[]>(url));
  }, [date, user, view]);

  useEffect(() => {
    let active = true;
    request<{ user: User | null }>("/api/auth/me")
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "ไม่สามารถเชื่อมต่อระบบได้");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setPoint(null);
      setBookings([]);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      request<ChargingPoint>("/api/org/charging-point"),
      refreshBookings(),
    ])
      .then(([chargingPoint]) => {
        if (active) setPoint(chargingPoint);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "ไม่สามารถโหลดข้อมูลจุดชาร์จได้");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshBookings, user]);

  useEffect(() => {
    if (!user) return undefined;
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
    } else {
      setNotificationPermission(Notification.permission);
    }

    let active = true;
    const checkReminders = async () => {
      try {
        const upcoming = await request<BookingReminder[]>("/api/org/bookings?reminders=true");
        if (!active) return;
        const staleThreshold = Date.now() - 5 * 60 * 1000;
        setReminders((current) => current.filter(
          (reminder) => new Date(reminder.startAt).getTime() >= staleThreshold,
        ));
        const alreadyShown = getShownReminderIds();
        const newReminders = upcoming.filter((booking) => !alreadyShown.has(booking.id));
        if (!newReminders.length) return;

        setReminders((current) => [...current, ...newReminders]);
        for (const booking of newReminders) {
          saveShownReminder(booking.id);
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("EV Park · แจ้งเตือนการจอง", {
                body: "อีก 10 นาทีจะถึงเวลาใช้งานหัวชาร์จ โปรดเตรียมตัว",
                tag: `evpark-booking-${booking.id}`,
              });
            } catch (cause) {
              console.error("Could not display browser notification", cause);
            }
          }
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "ไม่สามารถตรวจสอบการแจ้งเตือนได้");
        }
      }
    };

    void checkReminders();
    const interval = window.setInterval(() => void checkReminders(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await request<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ employeeCode, password }),
      });
      setUser(result.user);
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setSaving(true);
    setError("");
    try {
      await request<null>("/api/auth/logout", { method: "POST" });
      setUser(null);
      setPoint(null);
      setBookings([]);
      setNotice("");
      setReminders([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ออกจากระบบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    try {
      setNotificationPermission(await Notification.requestPermission());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ไม่สามารถเปิดการแจ้งเตือนของเบราว์เซอร์ได้");
    }
  }

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!point) return;
    setSaving(true);
    setError("");
    const startAt = new Date(`${date}T${time}:00+07:00`);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const conflict = bookings.some((booking) => (
      new Date(booking.startAt) < endAt && new Date(booking.endAt) > startAt
    ));
    if (startAt <= new Date()) {
      setError("เวลาเริ่มจองต้องเป็นเวลาถัดไป");
      setSaving(false);
      return;
    }
    if (conflict) {
      setError("ช่วงเวลานี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น");
      setSaving(false);
      return;
    }

    try {
      const booking = await request<{ employeeCode: string }>("/api/org/bookings", {
        method: "POST",
        body: JSON.stringify({
          employeeCode: bookingEmployeeCode.trim().toUpperCase(),
          startAt: startAt.toISOString(),
          durationMinutes,
        }),
      });
      setBookingEmployeeCode("");
      setNotice(`จองสำเร็จ · รหัสพนักงาน ${booking.employeeCode} · ไม่มีค่าบริการ`);
      try {
        await refreshBookings();
      } catch {
        setError("จองสำเร็จแล้ว แต่โหลดตารางล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้า");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "จองจุดชาร์จไม่สำเร็จ");
      if (cause instanceof ApiRequestError && cause.status === 409) {
        try {
          await refreshBookings();
        } catch {
          setError(`${cause.message} และโหลดตารางล่าสุดไม่สำเร็จ`);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking(id: string) {
    if (!window.confirm("ยืนยันยกเลิกรายการจองนี้หรือไม่?")) return;
    setSaving(true);
    setError("");
    try {
      await request(`/api/org/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      setNotice("ยกเลิกรายการจองแล้ว");
      try {
        await refreshBookings();
      } catch {
        setError("ยกเลิกรายการจองแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้า");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ยกเลิกรายการจองไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const selectedDayHours = useMemo(() => {
    if (!date) return undefined;
    const day = new Date(`${date}T12:00:00+07:00`).getUTCDay();
    return point?.operatingHours.find((hours) => hours.weekday === day);
  }, [date, point]);

  if (loading && !user) {
    return <main className="org-loading">กำลังเชื่อมต่อระบบจองของบริษัท…</main>;
  }

  if (!user) {
    return (
      <main className="org-auth-page">
        <section className="org-auth-card">
          <div className="org-auth-logo"><BoltMark /></div>
          <div className="org-eyebrow">ADMIN ACCESS</div>
          <h1>เข้าสู่ระบบ</h1>
          <p className="org-auth-intro">ลงชื่อเข้าใช้ด้วยรหัสผู้ดูแลระบบ เพื่อจัดการ และ จองจุดชาร์จรถไฟฟ้าของบริษัท</p>

          <form className="org-auth-form" onSubmit={submitAuth}>
            <label>
              รหัสพนักงาน
              <input required minLength={2} maxLength={32} autoComplete="username" value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} placeholder="xxxx" />
            </label>
            <label>
              รหัสผ่าน
              <input required type="password" minLength={1} maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <p className="org-alert error" role="alert">{error}</p>}
            <button className="org-primary-button full" disabled={saving}>
              {saving ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
            </button>
          </form>
          <p className="org-auth-footnote">ไม่เปิดสมัครสมาชิก · ติดต่อผู้ดูแลระบบหากต้องการบัญชี</p>
        </section>
      </main>
    );
  }

  return (
    <div className="org-app">
      <header className="org-topbar">
        <a className="org-brand" href="#home" aria-label="EV Park หน้าหลัก">
          <BoltMark />
          <span>EV<span> Park GJTH</span></span>
        </a>
        <nav className="org-nav" aria-label="เมนูหลัก">
          <button type="button" className={view === "schedule" ? "active" : ""} onClick={() => { setView("schedule"); setError(""); }}>ตารางจุดชาร์จ</button>
          <button type="button" className={view === "mine" ? "active" : ""} onClick={() => { setView("mine"); setError(""); }}>การจองของฉัน</button>
        </nav>
        <div className="org-user">
          <span className="org-user-avatar">{user.name.trim().slice(0, 1).toUpperCase()}</span>
          <span className="org-user-label"><strong>{user.name}</strong><small>{user.employeeCode}</small></span>
          <button
            type="button"
            className="org-notification-button"
            onClick={enableNotifications}
            disabled={notificationPermission !== "default"}
            title="การแจ้งเตือนทำงานขณะที่เปิดหน้าเว็บไว้เท่านั้น"
          >
            {notificationPermission === "granted"
              ? "เปิดแจ้งเตือนแล้ว"
              : notificationPermission === "denied"
                ? "แจ้งเตือนถูกบล็อก"
                : notificationPermission === "unsupported"
                  ? "แจ้งเตือนในหน้าเว็บ"
                  : "เปิดแจ้งเตือน"}
          </button>
          <button type="button" className="org-signout" onClick={signOut} disabled={saving}>ออกจากระบบ</button>
        </div>
      </header>

      <main className="org-main" id="home">
        <section className="org-hero">
          <div className="org-hero-copy">
            <div className="org-eyebrow"><span /> SHARED CHARGING POINT</div>
            <h1>จองเวลาใช้หัวชาร์จไฟฟ้า<br />ของบริษัท</h1>
            <p>มีหัวชาร์จหนึ่งจุดสำหรับทุกคนในบริษัท เลือกช่วงเวลาที่ว่าง แล้วจองไว้ล่วงหน้า</p>
          </div>
          <div className="org-hero-icon"><BoltMark /></div>
        </section>

        {error && <p className="org-alert error org-page-alert" role="alert">{error}</p>}
        {notice && <p className="org-alert success org-page-alert" role="status">{notice}</p>}
        {reminders.map((reminder) => (
          <div className="org-alert success org-page-alert org-reminder-alert" role="status" key={reminder.id}>
            <span>แจ้งเตือน: อีก 10 นาทีจะถึงเวลาใช้งานหัวชาร์จ ({formatTime(reminder.startAt)})</span>
            <button
              type="button"
              onClick={() => setReminders((current) => current.filter((item) => item.id !== reminder.id))}
              aria-label="ปิดการแจ้งเตือน"
            >
              ปิด
            </button>
          </div>
        ))}

        {view === "schedule" ? (
          <div className="org-content-grid">
            <section className="org-panel org-point-panel">
              <div className="org-panel-heading">
                <div>
                  <div className="org-section-label">จุดชาร์จของบริษัท</div>
                  <h2>{point?.name ?? "กำลังโหลดจุดชาร์จ…"}</h2>
                </div>
                <span className="org-free-tag">ใช้ฟรี</span>
              </div>
              {point && (
                <>
                  <p className="org-address">{point.address} · {point.district} {point.province}</p>
                  <div className="org-charger-spec">
                    <span className="org-charger-icon"><BoltMark small /></span>
                    <span>
                      <strong>หัวชาร์จ</strong>

                    </span>
                    <span className="org-online"><i /> พร้อมใช้งาน</span>
                  </div>
                </>
              )}
              {error && !point && (
                <div className="org-setup-hint">
                  ตั้งค่าข้อมูลจุดชาร์จในไฟล์ `.env` แล้วเริ่มระบบใหม่
                </div>
              )}
              <div className="org-hours">
                <span>เวลาเปิดใช้ในวันที่เลือก</span>
                <strong>{selectedDayHours && !selectedDayHours.isClosed ? `${selectedDayHours.openTime}–${selectedDayHours.closeTime}` : "ปิดให้บริการ"}</strong>
              </div>
            </section>

            <section className="org-panel org-booking-panel">
              <div className="org-section-label">จองเวลาใช้งาน</div>
              <h2>เลือกช่วงเวลาที่ต้องการ</h2>
              <p className="org-panel-subtitle">การจองจะได้รับการยืนยันเมื่อบันทึกสำเร็จ และไม่คิดค่าบริการ</p>
              <form className="org-booking-form" onSubmit={createBooking}>
                <label>
                  รหัสพนักงานผู้จอง
                  <input
                    required
                    minLength={2}
                    maxLength={32}
                    autoComplete="off"
                    value={bookingEmployeeCode}
                    onChange={(event) => setBookingEmployeeCode(event.target.value)}
                    placeholder="เช่น GJTH-xxxx"
                  />
                </label>
                <label>
                  วันที่
                  <input type="date" required min={todayInBangkok()} value={date} onChange={(event) => setDate(event.target.value)} />
                </label>
                <div className="org-form-row">
                  <label>
                    เวลาเริ่มต้น
                    <input type="time" required step={1800} value={time} onChange={(event) => setTime(event.target.value)} />
                  </label>
                  <label>
                    ระยะเวลา
                    <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
                      {[30, 60, 120, 180, 240, 360, 480].map((minutes) => (
                        <option value={minutes} key={minutes}>{minutes < 60 ? `${minutes} นาที` : `${minutes / 60} ชั่วโมง`}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button className="org-primary-button" disabled={saving || !point}>
                  {saving ? "กำลังจอง…" : "ยืนยันการจอง"}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            </section>

            <section className="org-panel org-schedule-panel">
              <div className="org-panel-heading schedule-heading">
                <div>
                  <div className="org-section-label">ตารางใช้งาน</div>
                  <h2>{formatThaiDate(date)}</h2>
                </div>
                <span className="org-booking-count">{bookings.length} รายการ</span>
              </div>
              {loading ? (
                <p className="org-empty">กำลังโหลดตาราง…</p>
              ) : bookings.length ? (
                <div className="org-schedule-list">
                  {bookings.map((booking, index) => {
                    const status = getScheduleBookingStatus(
                      booking.startAt,
                      booking.endAt,
                      currentTime,
                    );
                    const statusLabels = {
                      waiting: "รอการชาร์จ",
                      charging: "กำลังชาร์จ",
                      completed: "ชาร์จเสร็จสิ้น",
                    };
                    return (
                      <article className={booking.isMine ? "org-schedule-item mine" : "org-schedule-item"} key={booking.id ?? `${booking.startAt}-${index}`}>
                        <div className="org-time-range">{formatTime(booking.startAt)}<span>–</span>{formatTime(booking.endAt)}</div>
                        <div className="org-schedule-detail">
                          <strong>{booking.isMine ? "จองโดยคุณ" : "มีผู้ใช้จอง"}</strong>
                          <small>{booking.isMine ? `รหัสพนักงาน ${booking.employeeCode}` : "ช่วงเวลานี้ไม่ว่าง"}</small>
                        </div>
                        <span className={`org-slot-status ${status}`}>{statusLabels[status]}</span>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="org-empty">
                  <span className="org-empty-mark"><BoltMark small /></span>
                  <strong>ยังไม่มีรายการจองในวันนี้</strong>
                  <span>เลือกเวลาเพื่อจองหัวชาร์จได้เลย</span>
                </div>
              )}
              <p className="org-privacy-note">เพื่อความเป็นส่วนตัว ตารางจะแสดงเฉพาะช่วงเวลาที่มีการจอง</p>
            </section>
          </div>
        ) : (
          <section className="org-panel org-my-bookings">
            <div className="org-panel-heading schedule-heading">
              <div>
                <div className="org-section-label">รายการส่วนตัว</div>
                <h2>การจองของฉัน</h2>
              </div>
              <span className="org-booking-count">{bookings.length} รายการล่าสุด</span>
            </div>
            {loading ? (
              <p className="org-empty">กำลังโหลดรายการจอง…</p>
            ) : bookings.length ? (
              <div className="org-my-booking-list">
                {bookings.map((booking) => {
                  const canCancel = ["PENDING", "CONFIRMED"].includes(booking.status)
                    && new Date(booking.startAt) > new Date();
                  const bookingId = booking.id;
                  return (
                    <article className="org-my-booking-item" key={booking.id}>
                      <div className="org-my-booking-icon"><BoltMark small /></div>
                      <div className="org-my-booking-details">
                        <strong>{formatBookingDate(booking.startAt)}</strong>
                        <span>{formatTime(booking.startAt)}–{formatTime(booking.endAt)} · รหัสพนักงาน {booking.employeeCode}</span>
                      </div>
                      <span className={`org-status-pill ${booking.status.toLowerCase()}`}>{formatBookingStatus(booking.status)}</span>
                      {canCancel && bookingId && <button className="org-cancel-button" disabled={saving} onClick={() => cancelBooking(bookingId)}>ยกเลิก</button>}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="org-empty">
                <strong>ยังไม่มีรายการจอง</strong>
                <button className="org-text-button" onClick={() => setView("schedule")}>ไปที่ตารางจุดชาร์จ</button>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="org-footer">
        <span className="org-footer-brand"><BoltMark small /> EV Park สำหรับบริษัท</span>
        <span>การจองเวลาขึ้นอยู่กับผู้ดูแลระบบ · ไม่มีค่าบริการ</span>
      </footer>
    </div>
  );
}
