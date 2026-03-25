"use client";

import { useRepoStore } from "@/stores/repo-store";
import { useFlowStore } from "@/stores/flow-store";
import { HandlerList } from "@/components/handler/HandlerList";
import type { FlowGraph } from "@/types";

export function Sidebar() {
  const {
    handlerCode,
    serviceCode,
    handlers,
    selectedHandlerId,
    isLoading,
    error,
    hasAnalyzed,
    setHandlerCode,
    setServiceCode,
    setHandlers,
    setSelectedHandlerId,
    setIsLoading,
    setError,
    setHasAnalyzed,
  } = useRepoStore();

  const { setFlowGraph } = useFlowStore();

  const handleAnalyze = async () => {
    if (!handlerCode.trim()) {
      setError("Please paste handler code.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handlerCode,
          serviceCode,
        }),
      });

      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const errData = await res.json();
          throw new Error(errData.error || "Parse failed");
        }
        throw new Error(`Server error (${res.status})`);
      }

      const data = await res.json();
      setHandlers(data.handlers);
      setHasAnalyzed(true);

      if (data.handlers.length > 0) {
        await handleSelectHandler(data.handlers[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHandler = async (id: string) => {
    setSelectedHandlerId(id);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/parse/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handlerCode,
          serviceCode,
        }),
      });

      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const errData = await res.json();
          throw new Error(errData.error || "Build FlowGraph failed");
        }
        throw new Error(`Server error (${res.status})`);
      }

      const graph: FlowGraph = await res.json();
      setFlowGraph(graph);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-gray-800 bg-gray-950">
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Handler Code
          </label>
          <textarea
            value={handlerCode}
            onChange={(e) => setHandlerCode(e.target.value)}
            placeholder="Paste handler / controller code here..."
            className="h-36 w-full resize-none rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 font-mono text-xs text-gray-300 placeholder-gray-600 focus:border-cyan-600 focus:outline-none"
            spellCheck={false}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Service Code (optional)
          </label>
          <textarea
            value={serviceCode}
            onChange={(e) => setServiceCode(e.target.value)}
            placeholder="Paste service / business logic code here..."
            className="h-36 w-full resize-none rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 font-mono text-xs text-gray-300 placeholder-gray-600 focus:border-purple-600 focus:outline-none"
            spellCheck={false}
          />
        </div>

        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
        >
          {isLoading ? "Analyzing..." : "Analyze"}
        </button>

        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="border-t border-gray-800 pt-3">
          <h3 className="mb-2 text-xs font-medium text-gray-400">
            Detected Handlers
          </h3>
          <HandlerList
            handlers={handlers}
            selectedId={selectedHandlerId}
            onSelect={(id) => handleSelectHandler(id)}
            hasAnalyzed={hasAnalyzed}
          />
        </div>
      </div>
    </aside>
  );
}
