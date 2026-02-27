"use client";

import type { GitHubRepo } from "@/types";

interface RepoCardProps {
  repo: GitHubRepo;
  onClick: () => void;
}

export function RepoCard({ repo, onClick }: RepoCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-gray-800 bg-gray-900 p-4 text-left transition-colors hover:border-gray-700 hover:bg-gray-800/50"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-200">{repo.name}</span>
        {repo.private && (
          <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
            Private
          </span>
        )}
      </div>

      {repo.description && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
          {repo.description}
        </p>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
        {repo.language && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
            {repo.language}
          </span>
        )}
        {repo.stargazers_count > 0 && (
          <span>&#9733; {repo.stargazers_count}</span>
        )}
        <span>{repo.owner}</span>
      </div>
    </button>
  );
}
