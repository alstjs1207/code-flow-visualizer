import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";
import type { FlowGraph } from "@/types";

interface FlowState {
  flowGraph: FlowGraph | null;
  rfNodes: Node[];
  rfEdges: Edge[];
  hoveredNodeId: string | null;

  setFlowGraph: (graph: FlowGraph | null) => void;
  setRfNodes: (nodes: Node[]) => void;
  setRfEdges: (edges: Edge[]) => void;
  setHoveredNodeId: (id: string | null) => void;
  reset: () => void;
}

export const useFlowStore = create<FlowState>((set) => ({
  flowGraph: null,
  rfNodes: [],
  rfEdges: [],
  hoveredNodeId: null,

  setFlowGraph: (graph) => set({ flowGraph: graph }),
  setRfNodes: (nodes) => set({ rfNodes: nodes }),
  setRfEdges: (edges) => set({ rfEdges: edges }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  reset: () =>
    set({
      flowGraph: null,
      rfNodes: [],
      rfEdges: [],
      hoveredNodeId: null,
    }),
}));
