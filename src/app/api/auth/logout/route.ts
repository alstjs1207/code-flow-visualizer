import { NextResponse } from "next/server";
import { COOKIE_ACCESS_TOKEN, COOKIE_USER } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_ACCESS_TOKEN);
  response.cookies.delete(COOKIE_USER);
  return response;
}
