"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { useFlowStore } from "@/stores/flow-store";
import { useRepoStore } from "@/stores/repo-store";
import { NodeTooltip } from "./NodeTooltip";
import { PathFilterBar } from "./PathFilterBar";
import {
  findPathNodes,
  getEntryNodeId,
  getTerminalNodeIds,
} from "@/lib/graph/path-finder";
import {
  flowGraphToMermaid,
  type MermaidResult,
} from "@/lib/mermaid/flowgraph-to-mermaid";
import { mermaidConfig } from "@/lib/mermaid/mermaid-config";
import { highlightSvg } from "@/lib/mermaid/svg-highlighter";
import { attachPanZoom } from "@/lib/mermaid/svg-pan-zoom";
import type { FlowNode } from "@/types";

let mermaidInitialized = false;

/** Post-render SVG styling for subgraphs and animations */
function applySvgStyles(container: HTMLElement) {
  // Style subgraph backgrounds for layer separation
  const subgraphs = container.querySelectorAll("g.cluster rect");
  subgraphs.forEach((rect) => {
    const el = rect as SVGRectElement;
    el.setAttribute("rx", "12");
    el.setAttribute("ry", "12");
    el.style.fillOpacity = "0.15";
    el.style.strokeDasharray = "6 3";
    el.style.strokeWidth = "1";
  });

  // Style subgraph title labels
  const subgraphLabels = container.querySelectorAll("g.cluster .nodeLabel");
  subgraphLabels.forEach((label) => {
    (label as HTMLElement).style.fontSize = "11px";
    (label as HTMLElement).style.fontWeight = "600";
    (label as HTMLElement).style.letterSpacing = "0.05em";
    (label as HTMLElement).style.textTransform = "uppercase";
  });

  // Add marching-ants animation for error (dashed) edges
  const style = document.createElement("style");
  style.textContent = `
    @keyframes mermaid-dash-march {
      to { stroke-dashoffset: -20; }
    }
    .mermaid-error-edge {
      animation: mermaid-dash-march 0.8s linear infinite;
    }
  `;
  container.appendChild(style);

  // Find dashed edges and apply animation class
  const paths = container.querySelectorAll("g.edgePaths path");
  paths.forEach((path) => {
    const dasharray = (path as SVGPathElement).style.strokeDasharray;
    if (dasharray && dasharray !== "none" && dasharray !== "0") {
      path.classList.add("mermaid-error-edge");
    }
  });
}

export function MermaidCanvas() {
  const {
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

  const { isFlowLoading, flowProgress } = useRepoStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const panZoomRef = useRef<ReturnType<typeof attachPanZoom> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mermaidResultRef = useRef<MermaidResult | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const renderIdRef = useRef(0);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  // Generate Mermaid definition from flowGraph
  const mermaidResult = useMemo(() => {
    if (!flowGraph) return null;
    return flowGraphToMermaid(flowGraph);
  }, [flowGraph]);

  // Initialize mermaid once
  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize(mermaidConfig);
      mermaidInitialized = true;
    }
  }, []);

  // Render Mermaid SVG when definition changes
  useEffect(() => {
    if (!mermaidResult || !svgWrapperRef.current) return;

    mermaidResultRef.current = mermaidResult;
    const currentRenderId = ++renderIdRef.current;

    async function renderDiagram() {
      try {
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidResult!.definition);

        // Guard against stale renders
        if (currentRenderId !== renderIdRef.current) return;
        if (!svgWrapperRef.current) return;

        svgWrapperRef.current.innerHTML = svg;

        // Apply post-render visual enhancements
        applySvgStyles(svgWrapperRef.current);

        // Attach pan/zoom
        if (panZoomRef.current) {
          panZoomRef.current.destroy();
        }
        if (containerRef.current && svgWrapperRef.current) {
          panZoomRef.current = attachPanZoom(
            containerRef.current,
            svgWrapperRef.current
          );
          // Fit view after a brief delay to let SVG settle
          requestAnimationFrame(() => {
            panZoomRef.current?.fitView();
          });
        }

        // Attach click/hover handlers to nodes
        attachEventHandlers();
      } catch (err) {
        console.error("Mermaid render error:", err);
      }
    }

    renderDiagram();

    return () => {
      if (panZoomRef.current) {
        panZoomRef.current.destroy();
        panZoomRef.current = null;
      }
    };
  }, [mermaidResult]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Apply highlighting via SVG DOM manipulation (no re-render)
  useEffect(() => {
    if (!svgWrapperRef.current || !mermaidResultRef.current) return;

    // Convert edge IDs to indices
    const highlightedEdgeIndices = new Set<number>();
    if (flowGraph && highlightedEdgeIds.size > 0) {
      flowGraph.edges.forEach((edge, index) => {
        const edgeId = `${edge.from}->${edge.to}`;
        if (highlightedEdgeIds.has(edgeId)) {
          highlightedEdgeIndices.add(index);
        }
      });
    }

    highlightSvg(
      svgWrapperRef.current,
      highlightedNodeIds,
      highlightedEdgeIndices,
      mermaidResultRef.current.nodeIds
    );
  }, [highlightedNodeIds, highlightedEdgeIds, flowGraph]);

  function attachEventHandlers() {
    if (!svgWrapperRef.current || !mermaidResultRef.current) return;

    const nodeElements = svgWrapperRef.current.querySelectorAll("g.node");
    const nodeIds = mermaidResultRef.current.nodeIds;

    nodeElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const nodeId = extractNodeIdFromElement(htmlEl, nodeIds);
      if (!nodeId) return;

      htmlEl.style.cursor = "pointer";

      htmlEl.addEventListener("click", (e) => {
        e.stopPropagation();
        handleNodeClick(nodeId);
      });

      htmlEl.addEventListener("mouseenter", (e) => {
        clearLeaveTimer();
        setHoveredNodeId(nodeId);
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setTooltipPos({
            x: (e as MouseEvent).clientX - rect.left,
            y: (e as MouseEvent).clientY - rect.top,
          });
        }
      });

      htmlEl.addEventListener("mouseleave", () => {
        clearLeaveTimer();
        leaveTimer.current = setTimeout(() => {
          setHoveredNodeId(null);
          setTooltipPos(null);
        }, 300);
      });
    });
  }

  function handleNodeClick(nodeId: string) {
    setSelectedNodeId(nodeId);

    if (!flowGraph) return;
    const node = flowGraph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (node.type === "return" || node.type === "error") {
      if (focusedTerminalId === nodeId) {
        setFocusedTerminalId(null);
      } else {
        setFocusedTerminalId(nodeId);
      }
    }
  }

  function handlePaneClick(e: React.MouseEvent) {
    // Only reset if clicking on the container background, not on SVG nodes
    if ((e.target as HTMLElement).closest("g.node")) return;
    setHoveredNodeId(null);
    setTooltipPos(null);
    setSelectedNodeId(null);
    setFocusedTerminalId(null);
    setPathFilter("all");
  }

  const hoveredNode: FlowNode | null =
    hoveredNodeId && flowGraph
      ? flowGraph.nodes.find((n) => n.id === hoveredNodeId) ?? null
      : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-gray-950"
      style={{
        backgroundImage:
          "radial-gradient(circle, #1e293b 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
      onClick={handlePaneClick}
    >
      <PathFilterBar />
      <div ref={svgWrapperRef} className="h-full w-full" />
      {hoveredNode && tooltipPos && (
        <NodeTooltip node={hoveredNode} position={tooltipPos} />
      )}
      {isFlowLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950/60">
          <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-900 px-5 py-3">
            <svg
              className="h-5 w-5 animate-spin text-cyan-400"
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
            <span className="text-sm text-gray-300">
              {flowProgress?.message || "Loading..."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function extractNodeIdFromElement(
  el: HTMLElement,
  nodeIds: string[]
): string | null {
  const id = el.id || "";
  for (const nodeId of nodeIds) {
    if (id.includes(`-${nodeId}-`) || id.endsWith(`-${nodeId}`)) {
      return nodeId;
    }
  }
  const dataId = el.getAttribute("data-id");
  if (dataId && nodeIds.includes(dataId)) return dataId;
  return null;
}
