"use client";

import { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import { useFlowStore } from "@/stores/flow-store";
import { NodeTooltip } from "./NodeTooltip";

interface PinnedTooltip {
  nodeId: string;
  pos: { x: number; y: number };
}

function FlowCanvasInner() {
  const { rfNodes, rfEdges, setHoveredNodeId, hoveredNodeId } = useFlowStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<PinnedTooltip | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const getRelativePos = (event: React.MouseEvent) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onNodeMouseEnter = (event: React.MouseEvent, node: Node) => {
    if (pinned) return;
    clearLeaveTimer();
    setHoveredNodeId(node.id);
    setTooltipPos(getRelativePos(event));
  };

  const onNodeMouseLeave = () => {
    if (pinned) return;
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => {
      setHoveredNodeId(null);
      setTooltipPos(null);
    }, 300);
  };

  const onNodeClick = (event: React.MouseEvent, node: Node) => {
    const pos = getRelativePos(event);
    if (pos) {
      clearLeaveTimer();
      setPinned({ nodeId: node.id, pos });
      setHoveredNodeId(node.id);
      setTooltipPos(pos);
    }
  };

  const onPaneClick = () => {
    setPinned(null);
    setHoveredNodeId(null);
    setTooltipPos(null);
  };

  const displayNodeId = pinned ? pinned.nodeId : hoveredNodeId;
  const displayPos = pinned ? pinned.pos : tooltipPos;
  const displayNode = displayNodeId
    ? rfNodes.find((n) => n.id === displayNodeId)
    : null;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-gray-950"
      >
        <Background color="#1e293b" gap={20} size={1} />
        <Controls
          className="!bg-gray-800 !border-gray-700 !rounded-lg [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-300 [&>button:hover]:!bg-gray-700"
        />
        <MiniMap
          nodeColor={(node) => {
            const layer = node.data?.layer as string;
            switch (layer) {
              case "handler":
                return "#22d3ee";
              case "service":
                return "#a78bfa";
              case "dao":
                return "#fbbf24";
              default:
                return "#64748b";
            }
          }}
          className="!bg-gray-900 !border-gray-700"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
      </ReactFlow>
      {displayNode && displayPos && (
        <NodeTooltip
          node={displayNode}
          position={displayPos}
          pinned={!!pinned}
          onClose={pinned ? onPaneClick : undefined}
        />
      )}
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
