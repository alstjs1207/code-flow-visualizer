"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const LAYER_COLORS: Record<string, string> = {
  handler: "#22d3ee",
  service: "#a78bfa",
  dao: "#fbbf24",
};

export function EntryNode({ data }: NodeProps) {
  const layerColor = LAYER_COLORS[data.layer as string] || "#22d3ee";

  return (
    <div
      className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-md border"
      style={{
        background: "#0e2a2d",
        borderColor: "#22d3ee",
        color: "#22d3ee",
      }}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: layerColor }}
      />
      <span className="truncate">{data.label as string}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-400" />
    </div>
  );
}
