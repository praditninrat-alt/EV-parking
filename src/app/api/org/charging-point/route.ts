import { jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOrganizationChargingPoint } from "@/lib/organization";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireUser();
    const chargingPoint = await getOrganizationChargingPoint();
    return NextResponse.json({ data: chargingPoint });
  } catch (error) {
    return jsonError(error);
  }
}
