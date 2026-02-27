"use client";

import { useFlowStore, type PathFilter } from "@/stores/flow-store";

const filters: { value: PathFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "success", label: "Success \u2713" },
  { value: "error", label: "Error \u2717" },
];

export function PathFilterBar() {
  const { pathFilter, setPathFilter } = useFlowStore();

  return (
    <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-lg border border-gray-700 bg-gray-900/90 p-1 backdrop-blur-sm">
      {filters.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setPathFilter(value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            pathFilter === value
              ? "bg-gray-700 text-gray-100"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
