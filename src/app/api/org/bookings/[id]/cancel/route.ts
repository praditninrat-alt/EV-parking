import { assertSameOrigin, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cancelOrganizationBooking } from "@/lib/org-bookings";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json({ data: await cancelOrganizationBooking(id) });
  } catch (error) {
    return jsonError(error);
  }
}
