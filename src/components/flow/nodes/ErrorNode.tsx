"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const LAYER_COLORS: Record<string, string> = {
  handler: "#22d3ee",
  service: "#a78bfa",
  dao: "#fbbf24",
};

export function ErrorNode({ data }: NodeProps) {
  const layerColor = LAYER_COLORS[data.layer as string] || "#f87171";
  const isFocused = data.isFocused as boolean;

  return (
    <div
      className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-md border"
      style={{
        background: "#2a1215",
        borderColor: "#f87171",
        color: "#f87171",
        boxShadow: isFocused
          ? "0 0 0 3px rgba(248, 113, 113, 0.3), 0 0 12px rgba(248, 113, 113, 0.2)"
          : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: layerColor }}
      />
      <span className="truncate">{data.label as string}</span>
    </div>
  );
}
