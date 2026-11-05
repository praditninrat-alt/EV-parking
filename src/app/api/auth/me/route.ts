import { jsonError } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({ data: { user: await currentUser() } });
  } catch (error) {
    return jsonError(error);
  }
}
