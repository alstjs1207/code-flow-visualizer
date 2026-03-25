"use client";

import { useFlowStore } from "@/stores/flow-store";

export function CodePanel() {
  const { selectedNodeId, flowGraph, setSelectedNodeId } = useFlowStore();

  if (!selectedNodeId || !flowGraph) return null;

  const node = flowGraph.nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-gray-800 bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <span className="text-sm font-medium text-gray-300">Code Detail</span>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="text-gray-500 hover:text-gray-300 text-sm leading-none"
        >
          ✕
        </button>
      </div>

      {/* Node info */}
      <div className="border-b border-gray-800 px-4 py-3">
        <p className="mb-2 truncate text-sm font-medium text-gray-200">
          {node.label}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {node.layer}
          </span>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {node.type}
          </span>
        </div>
        {node.source ? (
          <p className="mt-2 text-xs text-gray-500">
            {node.source.file}:{node.source.line}
          </p>
        ) : null}
      </div>

      {/* Code block */}
      {node.rawCode ? (
        <div className="flex-1 overflow-auto p-4">
          <pre className="rounded bg-gray-900 p-3 text-sm leading-relaxed text-gray-300">
            <code>{node.rawCode}</code>
          </pre>
        </div>
      ) : (
        <div className="flex-1 p-4">
          <p className="text-sm text-gray-500">No source code available</p>
        </div>
      )}
    </div>
  );
}
