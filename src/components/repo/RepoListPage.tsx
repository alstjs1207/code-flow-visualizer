"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GitHubRepo } from "@/types";
import { RepoCard } from "./RepoCard";

export function RepoListPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchRepos() {
      try {
        const res = await fetch("/api/repos");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch repos");
        }
        const data: GitHubRepo[] = await res.json();
        setRepos(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }

    fetchRepos();
  }, []);

  const filtered = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(search.toLowerCase()) ||
      repo.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">My Repositories</h1>
        <button
          onClick={() => router.push("/")}
          className="text-sm text-gray-500 transition-colors hover:text-gray-300"
        >
          &larr; Back to Paste Mode
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search repositories..."
        className="mb-6 w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:border-cyan-600 focus:outline-none"
      />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-cyan-500" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-600">
          {search ? "No repositories match your search." : "No repositories found."}
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map((repo) => (
          <RepoCard
            key={repo.id}
            repo={repo}
            onClick={() => router.push(`/repos/${repo.owner}/${repo.name}`)}
          />
        ))}
      </div>
    </div>
  );
}
