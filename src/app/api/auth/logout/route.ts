import { assertSameOrigin, jsonError } from "@/lib/api";
import { endSession } from "@/lib/auth";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await endSession();
    return NextResponse.json({ data: { loggedOut: true } });
  } catch (error) {
    return jsonError(error);
  }
}
