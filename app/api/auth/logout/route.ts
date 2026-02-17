import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function GET(request: Request) {
  // Build redirect URL relative to current request host.
  const redirectUrl = new URL("/", request.url);
  const response = NextResponse.redirect(redirectUrl);

  // Delete cookie so protected routes treat user as logged out.
  response.cookies.delete(SESSION_COOKIE_NAME);

  return response;
}
