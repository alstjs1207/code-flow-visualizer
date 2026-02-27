"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import { useFlowStore } from "@/stores/flow-store";
import { NodeTooltip } from "./NodeTooltip";
import { PathFilterBar } from "./PathFilterBar";
import {
  findPathNodes,
  getEntryNodeId,
  getTerminalNodeIds,
} from "@/lib/graph/path-finder";

function FlowCanvasInner() {
  const {
    rfNodes,
    rfEdges,
    flowGraph,
    setHoveredNodeId,
    hoveredNodeId,
    pathFilter,
    focusedTerminalId,
    setFocusedTerminalId,
    highlightedNodeIds,
    highlightedEdgeIds,
    setHighlighted,
    selectedNodeId,
    setSelectedNodeId,
    setPathFilter,
  } = useFlowStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

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

  // Recompute highlighted path when filter or focused terminal changes
  useEffect(() => {
    if (!flowGraph) {
      setHighlighted(new Set(), new Set());
      return;
    }

    const entryId = getEntryNodeId(flowGraph);
    if (!entryId) {
      setHighlighted(new Set(), new Set());
      return;
    }

    // Focused terminal takes priority over filter
    if (focusedTerminalId) {
      const result = findPathNodes(flowGraph, entryId, [focusedTerminalId]);
      setHighlighted(result.nodeIds, result.edgeIds);
      return;
    }

    if (pathFilter === "all") {
      setHighlighted(new Set(), new Set());
      return;
    }

    const targetType = pathFilter === "success" ? "return" : "error";
    const targets = getTerminalNodeIds(flowGraph, targetType);
    if (targets.length === 0) {
      setHighlighted(new Set(), new Set());
      return;
    }

    const result = findPathNodes(flowGraph, entryId, targets);
    setHighlighted(result.nodeIds, result.edgeIds);
  }, [flowGraph, pathFilter, focusedTerminalId, setHighlighted]);

  // Dimmed nodes
  const displayNodes = useMemo(
    () =>
      rfNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isFocused: focusedTerminalId === n.id,
        },
        style: {
          ...n.style,
          opacity:
            highlightedNodeIds.size === 0 || highlightedNodeIds.has(n.id)
              ? 1
              : 0.15,
          transition: "opacity 0.3s ease",
        },
      })),
    [rfNodes, highlightedNodeIds, focusedTerminalId]
  );

  // Dimmed edges
  const displayEdges = useMemo(
    () =>
      rfEdges.map((e) => ({
        ...e,
        style: {
          ...e.style,
          opacity:
            highlightedEdgeIds.size === 0 || highlightedEdgeIds.has(e.id)
              ? 1
              : 0.15,
          transition: "opacity 0.3s ease",
        },
      })),
    [rfEdges, highlightedEdgeIds]
  );

  const onNodeMouseEnter = (event: React.MouseEvent, node: Node) => {
    clearLeaveTimer();
    setHoveredNodeId(node.id);
    setTooltipPos(getRelativePos(event));
  };

  const onNodeMouseLeave = () => {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => {
      setHoveredNodeId(null);
      setTooltipPos(null);
    }, 300);
  };

  const onNodeClick = (_event: React.MouseEvent, node: Node) => {
    // Code panel: select node
    setSelectedNodeId(node.id);

    // Terminal node focus toggle
    const nodeType = node.data?.nodeType || node.type;
    if (nodeType === "return" || nodeType === "error") {
      if (focusedTerminalId === node.id) {
        setFocusedTerminalId(null);
      } else {
        setFocusedTerminalId(node.id);
      }
    }
  };

  const onPaneClick = () => {
    setHoveredNodeId(null);
    setTooltipPos(null);
    setSelectedNodeId(null);
    setFocusedTerminalId(null);
    setPathFilter("all");
  };

  const displayNode = hoveredNodeId
    ? rfNodes.find((n) => n.id === hoveredNodeId)
    : null;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <PathFilterBar />
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
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
        <Controls className="!bg-gray-800 !border-gray-700 !rounded-lg [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-300 [&>button:hover]:!bg-gray-700" />
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
      {displayNode && tooltipPos && (
        <NodeTooltip node={displayNode} position={tooltipPos} />
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
