import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";
import { createOctokit } from "@/lib/github/client";
import type { GitHubRepo } from "@/types";

export async function GET() {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const octokit = createOctokit(accessToken);
    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 100,
    });

    const repos: GitHubRepo[] = data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner.login,
      description: repo.description,
      private: repo.private,
      default_branch: repo.default_branch,
      language: repo.language,
      updated_at: repo.updated_at ?? "",
      html_url: repo.html_url,
      stargazers_count: repo.stargazers_count,
    }));

    return NextResponse.json(repos);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch repos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
