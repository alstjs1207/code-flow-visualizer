import { NextResponse } from "next/server";
import { getGitHubAuthorizeUrl, COOKIE_OAUTH_STATE } from "@/lib/auth";

export async function GET() {
  const { url, state } = getGitHubAuthorizeUrl();

  const response = NextResponse.redirect(url);
  response.cookies.set(COOKIE_OAUTH_STATE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  return response;
}
