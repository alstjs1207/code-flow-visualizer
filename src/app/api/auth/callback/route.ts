import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_USER,
  COOKIE_OAUTH_STATE,
  exchangeCodeForToken,
  fetchGitHubUser,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get(COOKIE_OAUTH_STATE)?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      new URL("/?error=invalid_state", request.url)
    );
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const user = await fetchGitHubUser(accessToken);

    const response = NextResponse.redirect(new URL("/repos", request.url));

    // Delete the state cookie
    response.cookies.delete(COOKIE_OAUTH_STATE);

    // Set access token (HTTP-only, not readable by client JS)
    response.cookies.set(COOKIE_ACCESS_TOKEN, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    // Set user info (readable by client JS for display)
    response.cookies.set(COOKIE_USER, JSON.stringify(user), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/?error=auth_failed", request.url)
    );
  }
}
