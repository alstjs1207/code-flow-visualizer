import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";
import type { FlowGraph } from "@/types";

export type PathFilter = "all" | "success" | "error";

interface FlowState {
  flowGraph: FlowGraph | null;
  rfNodes: Node[];
  rfEdges: Edge[];
  hoveredNodeId: string | null;

  // Path tracing
  pathFilter: PathFilter;
  focusedTerminalId: string | null;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;

  // Code panel
  selectedNodeId: string | null;

  setFlowGraph: (graph: FlowGraph | null) => void;
  setRfNodes: (nodes: Node[]) => void;
  setRfEdges: (edges: Edge[]) => void;
  setHoveredNodeId: (id: string | null) => void;
  setPathFilter: (filter: PathFilter) => void;
  setFocusedTerminalId: (id: string | null) => void;
  setHighlighted: (nodeIds: Set<string>, edgeIds: Set<string>) => void;
  setSelectedNodeId: (id: string | null) => void;
  reset: () => void;
}

export const useFlowStore = create<FlowState>((set) => ({
  flowGraph: null,
  rfNodes: [],
  rfEdges: [],
  hoveredNodeId: null,

  pathFilter: "all",
  focusedTerminalId: null,
  highlightedNodeIds: new Set<string>(),
  highlightedEdgeIds: new Set<string>(),

  selectedNodeId: null,

  setFlowGraph: (graph) => set({ flowGraph: graph }),
  setRfNodes: (nodes) => set({ rfNodes: nodes }),
  setRfEdges: (edges) => set({ rfEdges: edges }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setPathFilter: (filter) => set({ pathFilter: filter }),
  setFocusedTerminalId: (id) => set({ focusedTerminalId: id }),
  setHighlighted: (nodeIds, edgeIds) =>
    set({ highlightedNodeIds: nodeIds, highlightedEdgeIds: edgeIds }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  reset: () =>
    set({
      flowGraph: null,
      rfNodes: [],
      rfEdges: [],
      hoveredNodeId: null,
      pathFilter: "all",
      focusedTerminalId: null,
      highlightedNodeIds: new Set<string>(),
      highlightedEdgeIds: new Set<string>(),
      selectedNodeId: null,
    }),
}));
