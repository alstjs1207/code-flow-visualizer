import type { FlowGraph, FlowNode, FlowEdge, NodeType, EdgeType } from "@/types";

export interface MermaidEdgeMeta {
  index: number;
  type?: EdgeType;
}

export interface MermaidResult {
  definition: string;
  edgeMetas: MermaidEdgeMeta[];
  nodeIds: string[];
}

function escapeLabel(label: string): string {
  return `"${label.replace(/"/g, "#quot;")}"`;
}

function nodeShape(node: FlowNode): string {
  const label = escapeLabel(node.label);
  const type: NodeType = node.type;
  switch (type) {
    case "entry":
      return `([${label}])`;
    case "condition":
    case "validation":
      return `{${label}}`;
    case "action":
      return `[${label}]`;
    case "error":
      return `([${label}])`;
    case "return":
      return `([${label}])`;
    default:
      return `[${label}]`;
  }
}

function nodeClass(node: FlowNode): string {
  if (node.type === "error") return "errorNode";
  if (node.type === "return") return "returnNode";
  return node.layer;
}

function edgeColor(type?: EdgeType): string {
  switch (type) {
    case "true":
      return "#22c55e";
    case "false":
      return "#ef4444";
    case "error":
      return "#ef4444";
    default:
      return "#64748b";
  }
}

export function flowGraphToMermaid(graph: FlowGraph): MermaidResult {
  const lines: string[] = ["flowchart TD"];
  const nodeIds: string[] = [];
  const classAssignments = new Map<string, string[]>();

  // Node definitions
  for (const node of graph.nodes) {
    lines.push(`  ${node.id}${nodeShape(node)}`);
    nodeIds.push(node.id);

    const cls = nodeClass(node);
    if (!classAssignments.has(cls)) classAssignments.set(cls, []);
    classAssignments.get(cls)!.push(node.id);
  }

  // Edge definitions
  const edgeMetas: MermaidEdgeMeta[] = [];
  for (const edge of graph.edges) {
    const edgeLabel = edge.label ? `|${escapeLabel(edge.label)}|` : "";
    lines.push(`  ${edge.from} --> ${edgeLabel} ${edge.to}`);
    edgeMetas.push({ index: edgeMetas.length, type: edge.type });
  }

  // classDef
  lines.push("");
  lines.push("  classDef handler fill:#0e2a2d,stroke:#22d3ee,color:#22d3ee");
  lines.push("  classDef service fill:#1a1625,stroke:#a78bfa,color:#a78bfa");
  lines.push("  classDef dao fill:#1c1a0e,stroke:#fbbf24,color:#fbbf24");
  lines.push("  classDef errorNode fill:#2a1215,stroke:#f87171,color:#f87171");
  lines.push("  classDef returnNode fill:#0e2a1e,stroke:#34d399,color:#34d399");

  // class assignments
  for (const [cls, ids] of classAssignments) {
    lines.push(`  class ${ids.join(",")} ${cls}`);
  }

  // linkStyle for edges
  for (const meta of edgeMetas) {
    const color = edgeColor(meta.type);
    if (meta.type === "error") {
      lines.push(
        `  linkStyle ${meta.index} stroke:${color},stroke-width:2px,stroke-dasharray:5 5`
      );
    } else {
      const width = meta.type === "true" || meta.type === "false" ? "2px" : "1.5px";
      lines.push(`  linkStyle ${meta.index} stroke:${color},stroke-width:${width}`);
    }
  }

  return {
    definition: lines.join("\n"),
    edgeMetas,
    nodeIds,
  };
}
