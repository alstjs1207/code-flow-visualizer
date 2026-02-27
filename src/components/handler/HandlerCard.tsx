"use client";

import type { HandlerEntry } from "@/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-900 text-green-300",
  POST: "bg-blue-900 text-blue-300",
  PUT: "bg-orange-900 text-orange-300",
  PATCH: "bg-yellow-900 text-yellow-300",
  DELETE: "bg-red-900 text-red-300",
};

interface HandlerCardProps {
  handler: HandlerEntry;
  isSelected: boolean;
  onClick: () => void;
}

export function HandlerCard({ handler, isSelected, onClick }: HandlerCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
        isSelected
          ? "border-cyan-500 bg-cyan-950/40"
          : "border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            METHOD_COLORS[handler.method] || "bg-gray-800 text-gray-400"
          }`}
        >
          {handler.method}
        </span>
        <span className="truncate text-sm text-gray-300">{handler.path}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
        <span>{handler.functionName}</span>
        {handler.complexity > 0 && (
          <span className="text-yellow-600">{handler.complexity} branches</span>
        )}
      </div>
    </button>
  );
}
