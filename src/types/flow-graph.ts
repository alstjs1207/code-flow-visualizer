export interface FlowGraph {
  handler: string;
  method: HttpMethod;
  path: string;
  file: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface FlowNode {
  id: string;
  type: NodeType;
  layer: Layer;
  label: string;
  rawCode?: string;
  source?: SourceLocation;
  notes?: string;
}

export type NodeType =
  | "entry"
  | "validation"
  | "condition"
  | "action"
  | "error"
  | "return";

export type Layer = "handler" | "service" | "dao";

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  type?: EdgeType;
}

export type EdgeType = "normal" | "true" | "false" | "error";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}
