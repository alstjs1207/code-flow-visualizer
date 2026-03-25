"use client";

import { TopBar } from "@/components/layout/TopBar";
import { GitHubSidebar } from "@/components/layout/GitHubSidebar";
import { MermaidCanvas } from "@/components/flow/MermaidCanvas";
import { FlowStats } from "@/components/flow/FlowStats";
import { CodePanel } from "@/components/flow/CodePanel";

interface RepoVisualizerPageProps {
  owner: string;
  repo: string;
}

export function RepoVisualizerPage({ owner, repo }: RepoVisualizerPageProps) {
  return (
    <div className="flex h-screen flex-col">
      <TopBar repoName={`${owner}/${repo}`} />
      <div className="flex flex-1 overflow-hidden">
        <GitHubSidebar owner={owner} repo={repo} />
        <main className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col">
            <div className="flex-1">
              <MermaidCanvas />
            </div>
            <FlowStats />
          </div>
          <CodePanel />
        </main>
      </div>
    </div>
  );
}
