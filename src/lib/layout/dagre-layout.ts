import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { FlowGraph, FlowNode, FlowEdge, NodeType, EdgeType } from "@/types";

const NODE_DIMENSIONS: Record<NodeType, { width: number; height: number }> = {
  entry: { width: 200, height: 50 },
  validation: { width: 220, height: 50 },
  condition: { width: 200, height: 60 },
  action: { width: 220, height: 50 },
  error: { width: 200, height: 50 },
  return: { width: 180, height: 50 },
};

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

export function applyDagreLayout(graph: FlowGraph): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 50,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes
  for (const node of graph.nodes) {
    const dims = NODE_DIMENSIONS[node.type] || { width: 200, height: 50 };
    g.setNode(node.id, { width: dims.width, height: dims.height });
  }

  // Add edges
  for (const edge of graph.edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  // Convert to React Flow format
  const nodes: Node[] = graph.nodes.map((node) => {
    const dagreNode = g.node(node.id);
    const dims = NODE_DIMENSIONS[node.type] || { width: 200, height: 50 };

    return {
      id: node.id,
      type: node.type,
      position: {
        x: dagreNode.x - dims.width / 2,
        y: dagreNode.y - dims.height / 2,
      },
      data: {
        label: node.label,
        layer: node.layer,
        rawCode: node.rawCode,
        source: node.source,
        notes: node.notes,
        nodeType: node.type,
      },
      style: { width: dims.width, height: dims.height },
    };
  });

  const edges: Edge[] = graph.edges.map((edge, index) => ({
    id: `e-${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: "smoothstep",
    animated: edge.type === "error",
    style: getEdgeStyle(edge.type),
    labelStyle: getEdgeLabelStyle(edge.type),
  }));

  return { nodes, edges };
}

function getEdgeStyle(type?: EdgeType): React.CSSProperties {
  switch (type) {
    case "true":
      return { stroke: "#22c55e", strokeWidth: 2 };
    case "false":
      return { stroke: "#ef4444", strokeWidth: 2 };
    case "error":
      return { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5,5" };
    default:
      return { stroke: "#64748b", strokeWidth: 1.5 };
  }
}

function getEdgeLabelStyle(type?: EdgeType): React.CSSProperties {
  switch (type) {
    case "true":
      return { fill: "#22c55e", fontWeight: 600, fontSize: 12 };
    case "false":
      return { fill: "#ef4444", fontWeight: 600, fontSize: 12 };
    default:
      return { fill: "#94a3b8", fontSize: 11 };
  }
}
