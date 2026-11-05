import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(400, "INVALID_JSON", "รูปแบบข้อมูลไม่ถูกต้อง");
    }
    throw error;
  }
  return schema.parse(data);
}

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError(403, "INVALID_ORIGIN", "คำขอนี้ไม่ได้รับอนุญาต");
  }
  if (originUrl.host !== request.headers.get("host")) {
    throw new ApiError(403, "INVALID_ORIGIN", "คำขอนี้ไม่ได้รับอนุญาต");
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "กรุณาตรวจสอบข้อมูลที่กรอก",
          details: error.issues.map(({ path, message }) => ({ path, message })),
        },
      },
      { status: 400 },
    );
  }
  console.error("API request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดในระบบ" } },
    { status: 500 },
  );
}
