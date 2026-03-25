import { create } from "zustand";
import type { FlowGraph } from "@/types";

export type PathFilter = "all" | "success" | "error";

interface FlowState {
  flowGraph: FlowGraph | null;
  hoveredNodeId: string | null;

  // Path tracing
  pathFilter: PathFilter;
  focusedTerminalId: string | null;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;

  // Code panel
  selectedNodeId: string | null;

  setFlowGraph: (graph: FlowGraph | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  setPathFilter: (filter: PathFilter) => void;
  setFocusedTerminalId: (id: string | null) => void;
  setHighlighted: (nodeIds: Set<string>, edgeIds: Set<string>) => void;
  setSelectedNodeId: (id: string | null) => void;
  reset: () => void;
}

export const useFlowStore = create<FlowState>((set) => ({
  flowGraph: null,
  hoveredNodeId: null,

  pathFilter: "all",
  focusedTerminalId: null,
  highlightedNodeIds: new Set<string>(),
  highlightedEdgeIds: new Set<string>(),

  selectedNodeId: null,

  setFlowGraph: (graph) => set({ flowGraph: graph }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setPathFilter: (filter) => set({ pathFilter: filter }),
  setFocusedTerminalId: (id) => set({ focusedTerminalId: id }),
  setHighlighted: (nodeIds, edgeIds) =>
    set({ highlightedNodeIds: nodeIds, highlightedEdgeIds: edgeIds }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  reset: () =>
    set({
      flowGraph: null,
      hoveredNodeId: null,
      pathFilter: "all",
      focusedTerminalId: null,
      highlightedNodeIds: new Set<string>(),
      highlightedEdgeIds: new Set<string>(),
      selectedNodeId: null,
    }),
}));
