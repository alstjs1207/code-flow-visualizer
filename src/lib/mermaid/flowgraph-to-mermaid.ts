import type { FlowGraph, FlowNode, EdgeType } from "@/types";

export interface MermaidEdgeMeta {
  index: number;
  type?: EdgeType;
}

export interface MermaidResult {
  definition: string;
  edgeMetas: MermaidEdgeMeta[];
  nodeIds: string[];
}

const LABEL_MAX_LEN = 40;

function escapeLabel(label: string): string {
  return `"${label.replace(/"/g, "#quot;")}"`;
}

function truncateLabel(label: string): string {
  if (label.length <= LABEL_MAX_LEN) return label;
  return label.slice(0, LABEL_MAX_LEN - 1) + "…";
}

/** Prefix icon for quick visual scanning */
function nodeIcon(node: FlowNode): string {
  switch (node.type) {
    case "entry":
      return "▶ ";
    case "condition":
    case "validation":
      return "◇ ";
    case "action":
      return "";
    case "error":
      return "✗ ";
    case "return":
      return "✓ ";
    default:
      return "";
  }
}

function nodeShape(node: FlowNode): string {
  const icon = nodeIcon(node);
  const label = escapeLabel(icon + truncateLabel(node.label));
  switch (node.type) {
    case "entry":
      return `([${label}])`;
    case "condition":
    case "validation":
      return `{${label}}`;
    case "action":
      return `[${label}]`;
    case "error":
      return `[/${label}\\]`; // trapezoid
    case "return":
      return `[\\${label}/]`; // inverse trapezoid
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

const LAYER_ORDER: readonly string[] = ["handler", "service", "dao"];
const LAYER_TITLES: Record<string, string> = {
  handler: "Handler",
  service: "Service",
  dao: "DAO / Repository",
};

export function flowGraphToMermaid(graph: FlowGraph): MermaidResult {
  const lines: string[] = ["flowchart TD"];
  const nodeIds: string[] = [];
  const classAssignments = new Map<string, string[]>();

  // Group nodes by layer for subgraphs
  const layerNodes = new Map<string, FlowNode[]>();
  for (const node of graph.nodes) {
    const layer = node.layer;
    if (!layerNodes.has(layer)) layerNodes.set(layer, []);
    layerNodes.get(layer)!.push(node);
  }

  // Emit nodes inside subgraphs, ordered by layer
  const orderedLayers = [...layerNodes.keys()].sort(
    (a, b) => LAYER_ORDER.indexOf(a) - LAYER_ORDER.indexOf(b)
  );

  for (const layer of orderedLayers) {
    const nodes = layerNodes.get(layer)!;
    const title = LAYER_TITLES[layer] || layer;
    lines.push(`  subgraph ${layer}["${title}"]`);
    lines.push(`    direction TB`);
    for (const node of nodes) {
      lines.push(`    ${node.id}${nodeShape(node)}`);
      nodeIds.push(node.id);

      const cls = nodeClass(node);
      if (!classAssignments.has(cls)) classAssignments.set(cls, []);
      classAssignments.get(cls)!.push(node.id);
    }
    lines.push(`  end`);
  }

  // Edge definitions (must be outside subgraphs for cross-subgraph edges)
  const edgeMetas: MermaidEdgeMeta[] = [];
  for (const edge of graph.edges) {
    const edgeLabel = edge.label ? `|${escapeLabel(edge.label)}|` : "";
    lines.push(`  ${edge.from} -->${edgeLabel} ${edge.to}`);
    edgeMetas.push({ index: edgeMetas.length, type: edge.type });
  }

  // classDef — nodes
  lines.push("");
  lines.push("  classDef handler fill:#0e2a2d,stroke:#22d3ee,color:#22d3ee,stroke-width:2px");
  lines.push("  classDef service fill:#1a1625,stroke:#a78bfa,color:#a78bfa,stroke-width:2px");
  lines.push("  classDef dao fill:#1c1a0e,stroke:#fbbf24,color:#fbbf24,stroke-width:2px");
  lines.push("  classDef errorNode fill:#2a1215,stroke:#f87171,color:#f87171,stroke-width:2px");
  lines.push("  classDef returnNode fill:#0e2a1e,stroke:#34d399,color:#34d399,stroke-width:2px");

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
      const width =
        meta.type === "true" || meta.type === "false" ? "2px" : "1.5px";
      lines.push(
        `  linkStyle ${meta.index} stroke:${color},stroke-width:${width}`
      );
    }
  }

  return {
    definition: lines.join("\n"),
    edgeMetas,
    nodeIds,
  };
}
