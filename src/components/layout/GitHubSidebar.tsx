"use client";

import { useMemo, useState } from "react";
import { useRepoStore } from "@/stores/repo-store";
import { useFlowStore } from "@/stores/flow-store";
import { HandlerCard } from "@/components/handler/HandlerCard";
import { groupHandlers } from "@/lib/handler-group";
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

  const { setFlowGraph } = useFlowStore();

  const [patternsText, setPatternsText] = useState(globPatterns.join("\n"));
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );

  const filteredHandlers = useMemo(() => {
    if (!searchQuery.trim()) return handlers;
    const q = searchQuery.toLowerCase();
    return handlers.filter(
      (h) =>
        h.path.toLowerCase().includes(q) ||
        h.method.toLowerCase().includes(q) ||
        h.functionName.toLowerCase().includes(q)
    );
  }, [handlers, searchQuery]);

  const groupedHandlers = useMemo(
    () => groupHandlers(filteredHandlers),
    [filteredHandlers]
  );

  const isSearching = searchQuery.trim().length > 0;

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

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

        {/* Handler list */}
        <div className="border-t border-gray-800 pt-3">
          <h3 className="mb-2 text-xs font-medium text-gray-400">
            Detected Handlers
          </h3>

          {/* Search */}
          {handlers.length > 0 && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search handlers..."
              className="mb-2 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:border-cyan-600 focus:outline-none"
            />
          )}

          {/* Grouped handlers */}
          {filteredHandlers.length === 0 ? (
            hasAnalyzed ? (
              <div className="rounded-lg border border-amber-800 bg-amber-950 px-3 py-3 text-xs text-amber-400">
                <p className="font-medium">
                  {isSearching
                    ? "검색 결과가 없습니다."
                    : "분석 가능한 핸들러 함수를 찾지 못했습니다."}
                </p>
                {!isSearching && (
                  <>
                    <p className="mt-1 text-amber-500">
                      다음 형태의 코드를 포함해 주세요:
                    </p>
                    <code className="mt-1 block text-[11px] text-amber-600">
                      router.get(&quot;/path&quot;, handler)
                    </code>
                    <code className="mt-1 block text-[11px] text-amber-600">
                      export async function handler(req, res)
                    </code>
                    <code className="mt-1 block text-[11px] text-amber-600">
                      this.server.get(&quot;/path&quot;, opts, handler)
                    </code>
                  </>
                )}
              </div>
            ) : (
              <div className="px-3 py-4 text-center text-xs text-gray-600">
                No handlers detected. Click Scan Repository to start.
              </div>
            )
          ) : (
            <div className="flex flex-col gap-1">
              {[...groupedHandlers.entries()].map(([group, items]) => {
                const isCollapsed =
                  !isSearching && collapsedGroups.has(group);
                return (
                  <div key={group}>
                    <button
                      onClick={() => toggleGroup(group)}
                      className="flex w-full items-center gap-1 rounded px-1 py-1 text-xs font-medium text-gray-400 hover:bg-gray-800/50 hover:text-gray-300"
                    >
                      <span className="text-[10px]">
                        {isCollapsed ? "▶" : "▼"}
                      </span>
                      <span>{group}</span>
                      <span className="text-gray-600">({items.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div className="flex flex-col gap-1 pb-1 pl-2">
                        {items.map((handler) => (
                          <HandlerCard
                            key={handler.id}
                            handler={handler}
                            isSelected={handler.id === selectedHandlerId}
                            isLoading={isFlowLoading}
                            onClick={() =>
                              !isFlowLoading &&
                              handleSelectHandler(handler.id)
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
