"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const LAYER_COLORS: Record<string, string> = {
  handler: "#22d3ee",
  service: "#a78bfa",
  dao: "#fbbf24",
};

export function ActionNode({ data }: NodeProps) {
  const layerColor = LAYER_COLORS[data.layer as string] || "#a78bfa";

  return (
    <div
      className="flex items-center gap-2 rounded-md px-4 py-2 text-sm shadow-md border"
      style={{
        background: "#1a1625",
        borderColor: "#a78bfa",
        color: "#a78bfa",
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: layerColor }}
      />
      <span className="truncate">{data.label as string}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </div>
  );
}
