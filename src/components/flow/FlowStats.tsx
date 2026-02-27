"use client";

import { useFlowStore } from "@/stores/flow-store";

export function FlowStats() {
  const { flowGraph } = useFlowStore();

  if (!flowGraph) return null;

  const conditions = flowGraph.nodes.filter(
    (n) => n.type === "condition" || n.type === "validation"
  ).length;
  const errors = flowGraph.nodes.filter((n) => n.type === "error").length;
  const daoCalls = flowGraph.nodes.filter((n) => n.layer === "dao").length;
  const totalNodes = flowGraph.nodes.length;

  return (
    <div className="flex items-center gap-4 border-t border-gray-800 bg-gray-950 px-4 py-2 text-xs">
      <StatBadge label="Branches" value={conditions} color="text-yellow-400" />
      <StatBadge label="Errors" value={errors} color="text-red-400" />
      <StatBadge label="DB Calls" value={daoCalls} color="text-amber-400" />
      <StatBadge label="Total Nodes" value={totalNodes} color="text-gray-400" />
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`font-bold ${color}`}>{value}</span>
      <span className="text-gray-500">{label}</span>
    </span>
  );
}
