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
  isLoading?: boolean;
  onClick: () => void;
}

export function HandlerCard({ handler, isSelected, isLoading, onClick }: HandlerCardProps) {
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
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            METHOD_COLORS[handler.method] || "bg-gray-800 text-gray-400"
          }`}
        >
          {handler.method}
        </span>
        <span className="truncate text-sm text-gray-300">{handler.path}</span>
        {isSelected && isLoading && (
          <svg
            className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-cyan-400"
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
        )}
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
