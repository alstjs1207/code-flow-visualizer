"use client";

import { useFlowStore } from "@/stores/flow-store";

export function CodePanel() {
  const { selectedNodeId, rfNodes, setSelectedNodeId } = useFlowStore();

  if (!selectedNodeId) return null;

  const node = rfNodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const { rawCode, source, layer, nodeType, label } = node.data as Record<
    string,
    unknown
  >;

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
          {label as string}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {layer as string}
          </span>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {(nodeType as string) || (node.type as string)}
          </span>
        </div>
        {source ? (
          <p className="mt-2 text-xs text-gray-500">
            {(source as { file: string; line: number }).file}:
            {(source as { file: string; line: number }).line}
          </p>
        ) : null}
      </div>

      {/* Code block */}
      {rawCode ? (
        <div className="flex-1 overflow-auto p-4">
          <pre className="rounded bg-gray-900 p-3 text-sm leading-relaxed text-gray-300">
            <code>{rawCode as string}</code>
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
