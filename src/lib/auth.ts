import { cookies } from "next/headers";
import type { GitHubUser } from "@/types/auth";

export const COOKIE_ACCESS_TOKEN = "gh_access_token";
export const COOKIE_USER = "gh_user";
export const COOKIE_OAUTH_STATE = "gh_oauth_state";

export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_ACCESS_TOKEN)?.value;
}

export function getGitHubAuthorizeUrl(): { url: string; state: string } {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback`,
    scope: "read:user repo",
    state,
  });
  return {
    url: `https://github.com/login/oauth/authorize?${params}`,
    state,
  };
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_ID,
      client_secret: process.env.GITHUB_SECRET,
      code,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  return data.access_token;
}

export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch GitHub user");
  }

  const data = await res.json();
  return {
    login: data.login,
    name: data.name,
    avatar_url: data.avatar_url,
  };
}
