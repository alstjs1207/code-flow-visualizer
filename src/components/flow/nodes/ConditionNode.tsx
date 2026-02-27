"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const LAYER_COLORS: Record<string, string> = {
  handler: "#22d3ee",
  service: "#a78bfa",
  dao: "#fbbf24",
};

export function ConditionNode({ data }: NodeProps) {
  const layerColor = LAYER_COLORS[data.layer as string] || "#fbbf24";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 200, height: 60 }}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-400" />
      <svg
        className="absolute inset-0"
        width="200"
        height="60"
        viewBox="0 0 200 60"
      >
        <polygon
          points="100,2 198,30 100,58 2,30"
          fill="#1c1a0e"
          stroke="#fbbf24"
          strokeWidth="1.5"
        />
      </svg>
      <div className="relative z-10 flex items-center gap-1 px-6 text-xs text-yellow-300 text-center max-w-[160px]">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ background: layerColor }}
        />
        <span className="truncate">{data.label as string}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-yellow-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-yellow-400"
      />
    </div>
  );
}
