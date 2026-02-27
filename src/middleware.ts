import { NextRequest, NextResponse } from "next/server";
import { COOKIE_ACCESS_TOKEN } from "@/lib/auth";

export function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_ACCESS_TOKEN);
  if (!token && request.nextUrl.pathname.startsWith("/repos")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/repos/:path*"],
};
