import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ApiError } from "./api";
import { prisma } from "./db";

const COOKIE_NAME = "evpark_session";
const SESSION_DAYS = 14;
const SESSION_TTL_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function adminUser(id: string): {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
  role: "ADMIN";
  createdAt: Date;
} {
  return {
    id,
    name: "ผู้ดูแลระบบ",
    email: process.env.ADMIN_EMAIL?.trim().toLowerCase() || "admin@local.invalid",
    employeeCode: "ADMIN",
    role: "ADMIN",
    createdAt: new Date(0),
  };
}

export async function startSession() {
  const token = randomBytes(32).toString("base64url");
  const userId = "admin";
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await prisma.organizationSession.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(expiresAt),
    },
  });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
  return adminUser(userId);
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.organizationSession.deleteMany({ where: { id: hashToken(token) } });
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function currentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.organizationSession.findUnique({ where: { id: hashToken(token) } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.organizationSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  return adminUser(session.userId);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ");
  return user;
}
