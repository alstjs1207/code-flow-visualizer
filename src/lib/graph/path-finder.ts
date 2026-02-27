import type { FlowGraph } from "@/types";

export interface PathResult {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Bidirectional BFS reachability intersection.
 * Finds all nodes/edges on paths from entryId to any of targetNodeIds.
 */
export function findPathNodes(
  flowGraph: FlowGraph,
  entryId: string,
  targetNodeIds: string[]
): PathResult {
  if (targetNodeIds.length === 0) {
    return { nodeIds: new Set(), edgeIds: new Set() };
  }

  // Build adjacency lists from FlowGraph edges
  const forward = new Map<string, string[]>(); // node → outgoing neighbors
  const reverse = new Map<string, string[]>(); // node → incoming neighbors
  const edgeKey = (from: string, to: string) => `${from}->${to}`;
  const edgeKeyToId = new Map<string, string>();

  for (const edge of flowGraph.edges) {
    if (!forward.has(edge.from)) forward.set(edge.from, []);
    forward.get(edge.from)!.push(edge.to);

    if (!reverse.has(edge.to)) reverse.set(edge.to, []);
    reverse.get(edge.to)!.push(edge.from);

    // Map edge key to the ReactFlow edge id format
    edgeKeyToId.set(edgeKey(edge.from, edge.to), `${edge.from}->${edge.to}`);
  }

  // Forward BFS from entry
  const forwardReachable = bfs(entryId, forward);

  // Reverse BFS from targets
  const reverseReachable = new Set<string>();
  for (const targetId of targetNodeIds) {
    for (const id of bfs(targetId, reverse)) {
      reverseReachable.add(id);
    }
  }

  // Intersection: nodes reachable from entry AND that can reach a target
  const nodeIds = new Set<string>();
  for (const id of forwardReachable) {
    if (reverseReachable.has(id)) {
      nodeIds.add(id);
    }
  }

  // Edges where both source and target are in the path
  const edgeIds = new Set<string>();
  for (const edge of flowGraph.edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      const id = edgeKeyToId.get(edgeKey(edge.from, edge.to));
      if (id) edgeIds.add(id);
    }
  }

  return { nodeIds, edgeIds };
}

function bfs(startId: string, adjacency: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const queue = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

/**
 * Get entry node ID from a flow graph (first "entry" type node).
 */
export function getEntryNodeId(flowGraph: FlowGraph): string | null {
  const entry = flowGraph.nodes.find((n) => n.type === "entry");
  return entry?.id ?? null;
}

/**
 * Get terminal node IDs by type.
 */
export function getTerminalNodeIds(
  flowGraph: FlowGraph,
  type: "return" | "error"
): string[] {
  return flowGraph.nodes.filter((n) => n.type === type).map((n) => n.id);
}
