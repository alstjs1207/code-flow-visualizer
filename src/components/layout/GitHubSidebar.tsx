"use client";

import { useState } from "react";
import { useRepoStore } from "@/stores/repo-store";
import { useFlowStore } from "@/stores/flow-store";
import { HandlerList } from "@/components/handler/HandlerList";
import { applyDagreLayout } from "@/lib/layout/dagre-layout";
import type { FlowGraph } from "@/types";

interface GitHubSidebarProps {
  owner: string;
  repo: string;
}

export function GitHubSidebar({ owner, repo }: GitHubSidebarProps) {
  const {
    handlers,
    selectedHandlerId,
    isLoading,
    error,
    hasAnalyzed,
    branch,
    globPatterns,
    scanProgress,
    fileCount,
    isFlowLoading,
    flowProgress,
    setHandlers,
    setSelectedHandlerId,
    setIsLoading,
    setError,
    setHasAnalyzed,
    setBranch,
    setGlobPatterns,
    setScanProgress,
    setFileCount,
    setIsFlowLoading,
    setFlowProgress,
  } = useRepoStore();

  const { setFlowGraph, setRfNodes, setRfEdges } = useFlowStore();

  const [patternsText, setPatternsText] = useState(globPatterns.join("\n"));

  const handleScan = async () => {
    setIsLoading(true);
    setError(null);
    setScanProgress({ stage: "tree", message: "Fetching file tree..." });

    try {
      const patterns = patternsText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      setGlobPatterns(patterns);

      const params = new URLSearchParams();
      params.set("branch", branch);
      if (patterns.length > 0) {
        params.set("patterns", patterns.join(","));
      }

      setScanProgress({ stage: "files", message: "Scanning repository..." });

      const res = await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/scan?${params}`
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scan failed");
      }

      const data = await res.json();
      setHandlers(data.handlers);
      setFileCount(data.fileCount);
      setHasAnalyzed(true);
      setScanProgress({
        stage: "done",
        message: `Found ${data.handlers.length} handlers in ${data.fileCount} files`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed";
      setError(message);
      setScanProgress({ stage: "error", message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHandler = async (id: string) => {
    setSelectedHandlerId(id);
    setIsFlowLoading(true);
    setFlowProgress({ stage: "fetching", message: "Fetching service files..." });
    setError(null);

    try {
      const res = await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/handlers/${encodeURIComponent(id)}/flow`
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Build FlowGraph failed");
      }

      setFlowProgress({ stage: "building", message: "Building flow graph..." });

      const graph: FlowGraph = await res.json();
      setFlowGraph(graph);

      const { nodes, edges } = applyDagreLayout(graph);
      setRfNodes(nodes);
      setRfEdges(edges);

      setFlowProgress({ stage: "done", message: "Flow graph ready" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setFlowProgress({ stage: "error", message });
    } finally {
      setIsFlowLoading(false);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-gray-800 bg-gray-950">
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        {/* Repository info */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <div className="text-xs text-gray-500">Repository</div>
          <div className="text-sm font-medium text-gray-200">
            {owner}/{repo}
          </div>
        </div>

        {/* Branch */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Branch
          </label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-300 focus:border-cyan-600 focus:outline-none"
          />
        </div>

        {/* Glob patterns */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            File Patterns (one per line)
          </label>
          <textarea
            value={patternsText}
            onChange={(e) => setPatternsText(e.target.value)}
            className="h-28 w-full resize-none rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 font-mono text-xs text-gray-300 placeholder-gray-600 focus:border-cyan-600 focus:outline-none"
            spellCheck={false}
          />
        </div>

        {/* Scan button */}
        <button
          onClick={handleScan}
          disabled={isLoading}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
        >
          {isLoading ? "Scanning..." : "Scan Repository"}
        </button>

        {/* Scan progress */}
        {scanProgress && scanProgress.stage !== "error" && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-400">
            {scanProgress.message}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* File count */}
        {fileCount > 0 && (
          <div className="text-xs text-gray-600">
            {fileCount} files analyzed
          </div>
        )}

        {/* Flow loading progress */}
        {isFlowLoading && flowProgress && (
          <div className="flex items-center gap-2 rounded-lg border border-cyan-900 bg-cyan-950 px-3 py-2 text-xs text-cyan-400">
            <svg
              className="h-3 w-3 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {flowProgress.message}
          </div>
        )}

        {/* Handler list */}
        <div className="border-t border-gray-800 pt-3">
          <h3 className="mb-2 text-xs font-medium text-gray-400">
            Detected Handlers
          </h3>
          <HandlerList
            handlers={handlers}
            selectedId={selectedHandlerId}
            onSelect={(id) => handleSelectHandler(id)}
            hasAnalyzed={hasAnalyzed}
            disabled={isFlowLoading}
          />
        </div>
      </div>
    </aside>
  );
}
