"use client";

import { useRef, useLayoutEffect, useState } from "react";
import type { Node } from "@xyflow/react";

interface NodeTooltipProps {
  node: Node;
  position: { x: number; y: number };
}

const OFFSET_X = 12;
const OFFSET_Y = -8;

export function NodeTooltip({ node, position }: NodeTooltipProps) {
  const { rawCode, source, layer, nodeType } = node.data as Record<string, unknown>;
  const ref = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState<{ left: number; top: number }>({
    left: position.x + OFFSET_X,
    top: position.y + OFFSET_Y,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) return;

    const parentW = parent.clientWidth;
    const parentH = parent.clientHeight;
    const elW = el.offsetWidth;
    const elH = el.offsetHeight;

    let left = position.x + OFFSET_X;
    let top = position.y + OFFSET_Y;

    if (left + elW > parentW) {
      left = position.x - OFFSET_X - elW;
    }

    if (top + elH > parentH) {
      top = position.y - OFFSET_Y - elH;
    }

    if (left < 0) left = 4;
    if (top < 0) top = 4;

    setAdjusted({ left, top });
  }, [position]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-50 min-w-[24rem] max-w-2xl rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl"
      style={{ left: adjusted.left, top: adjusted.top }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded bg-gray-800 px-2 py-1 text-sm text-gray-400">
          {(layer as string) || "unknown"}
        </span>
        <span className="rounded bg-gray-800 px-2 py-1 text-sm text-gray-400">
          {(nodeType as string) || node.type}
        </span>
        {source ? (
          <span className="text-sm text-gray-500">
            {(source as { file: string; line: number }).file}:
            {(source as { file: string; line: number }).line}
          </span>
        ) : null}
      </div>
      {rawCode ? (
        <pre className="max-h-72 overflow-auto rounded bg-gray-950 p-3 text-sm leading-relaxed text-gray-300">
          <code>{rawCode as string}</code>
        </pre>
      ) : null}
    </div>
  );
}
