import { NextResponse } from "next/server";
import { getSessionIdentity } from "@/lib/session";

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json(
      {
        ok: false,
        message: "No active session.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: {
      email: identity.email,
      name: identity.name,
      role: identity.role,
    },
  });
}
