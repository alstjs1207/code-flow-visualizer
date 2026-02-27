"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { LayerLegend } from "@/components/flow/LayerLegend";
import { GitHubLoginButton } from "@/components/auth/GitHubLoginButton";

interface TopBarProps {
  repoName?: string;
}

export function TopBar({ repoName }: TopBarProps) {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-4 py-3">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-lg font-bold text-white hover:text-cyan-400 transition-colors">
          Code Flow Visualizer
        </Link>
        {repoName && (
          <>
            <span className="text-gray-600">/</span>
            <span className="text-sm text-gray-400">{repoName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {user && (
          <Link
            href="/repos"
            className="text-sm text-gray-400 transition-colors hover:text-gray-200"
          >
            My Repos
          </Link>
        )}
        <LayerLegend />
        <GitHubLoginButton />
      </div>
    </header>
  );
}
