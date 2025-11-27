import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Check for Better Auth session cookie (prefix configured in auth.ts)
  const sessionCookie = request.cookies.get("contacts-app.session_token");

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
