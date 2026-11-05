import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { assertSameOrigin, jsonError, parseBody, ApiError } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";

const loginSchema = z.object({
  employeeCode: z.string().trim().min(2).max(32).transform((value) => value.toUpperCase()),
  password: z.string().min(1).max(128),
});

function matchesSecret(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length && timingSafeEqual(inputBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    rateLimit(`login:${request.headers.get("x-forwarded-for") ?? "local"}`, 10, 60_000);
    const body = await parseBody(request, loginSchema);
    const adminPassword = process.env.ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new ApiError(503, "ADMIN_LOGIN_NOT_CONFIGURED", "ระบบยังไม่ได้ตั้งรหัสผ่านผู้ดูแลในไฟล์ .env");
    }
    if (body.employeeCode !== "ADMIN" || !matchesSecret(body.password, adminPassword)) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง");
    }
    const user = await startSession();
    return NextResponse.json({
      data: { user },
    });
  } catch (error) {
    return jsonError(error);
  }
}
