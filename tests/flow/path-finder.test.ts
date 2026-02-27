import { describe, it, expect } from "vitest";
import {
  findPathNodes,
  getEntryNodeId,
  getTerminalNodeIds,
} from "@/lib/graph/path-finder";
import type { FlowGraph, FlowNode, FlowEdge } from "@/types";

function makeGraph(
  nodes: FlowNode[],
  edges: FlowEdge[]
): FlowGraph {
  return {
    handler: "testHandler",
    method: "GET",
    path: "/test",
    file: "test.ts",
    nodes,
    edges,
  };
}

// Diamond graph:
//       h1 (entry)
//      /    \
//    h2      h3  (condition branches)
//    |        |
//    h4       h5
//  (return)  (error)
const diamondNodes: FlowNode[] = [
  { id: "h1", type: "entry", layer: "handler", label: "entry" },
  { id: "h2", type: "action", layer: "handler", label: "action A" },
  { id: "h3", type: "action", layer: "handler", label: "action B" },
  { id: "h4", type: "return", layer: "handler", label: "return ok" },
  { id: "h5", type: "error", layer: "handler", label: "throw err" },
];

const diamondEdges: FlowEdge[] = [
  { from: "h1", to: "h2", type: "true" },
  { from: "h1", to: "h3", type: "false" },
  { from: "h2", to: "h4" },
  { from: "h3", to: "h5" },
];

describe("path-finder", () => {
  describe("getEntryNodeId", () => {
    it("returns the entry node id", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      expect(getEntryNodeId(graph)).toBe("h1");
    });

    it("returns null when no entry node exists", () => {
      const graph = makeGraph(
        [{ id: "h2", type: "action", layer: "handler", label: "action" }],
        []
      );
      expect(getEntryNodeId(graph)).toBeNull();
    });
  });

  describe("getTerminalNodeIds", () => {
    it("returns return node ids", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      expect(getTerminalNodeIds(graph, "return")).toEqual(["h4"]);
    });

    it("returns error node ids", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      expect(getTerminalNodeIds(graph, "error")).toEqual(["h5"]);
    });
  });

  describe("findPathNodes", () => {
    it("returns empty sets when no targets given", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      const result = findPathNodes(graph, "h1", []);
      expect(result.nodeIds.size).toBe(0);
      expect(result.edgeIds.size).toBe(0);
    });

    it("finds success path (entry → return)", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      const result = findPathNodes(graph, "h1", ["h4"]);

      expect(result.nodeIds).toEqual(new Set(["h1", "h2", "h4"]));
      expect(result.edgeIds).toEqual(
        new Set(["h1->h2", "h2->h4"])
      );
      // Error branch should not be included
      expect(result.nodeIds.has("h3")).toBe(false);
      expect(result.nodeIds.has("h5")).toBe(false);
    });

    it("finds error path (entry → error)", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      const result = findPathNodes(graph, "h1", ["h5"]);

      expect(result.nodeIds).toEqual(new Set(["h1", "h3", "h5"]));
      expect(result.edgeIds).toEqual(
        new Set(["h1->h3", "h3->h5"])
      );
    });

    it("finds all terminal paths when targeting both", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      const result = findPathNodes(graph, "h1", ["h4", "h5"]);

      expect(result.nodeIds).toEqual(
        new Set(["h1", "h2", "h3", "h4", "h5"])
      );
    });

    it("handles merge nodes (both branches rejoin)", () => {
      // h1 → h2 → h4 (merge) → h5 (return)
      // h1 → h3 → h4 (merge) → h5 (return)
      const nodes: FlowNode[] = [
        { id: "h1", type: "entry", layer: "handler", label: "entry" },
        { id: "h2", type: "action", layer: "handler", label: "left" },
        { id: "h3", type: "action", layer: "handler", label: "right" },
        { id: "h4", type: "action", layer: "handler", label: "merge" },
        { id: "h5", type: "return", layer: "handler", label: "return" },
      ];
      const edges: FlowEdge[] = [
        { from: "h1", to: "h2" },
        { from: "h1", to: "h3" },
        { from: "h2", to: "h4" },
        { from: "h3", to: "h4" },
        { from: "h4", to: "h5" },
      ];
      const graph = makeGraph(nodes, edges);
      const result = findPathNodes(graph, "h1", ["h5"]);

      // All nodes should be in the path since both branches lead to h5
      expect(result.nodeIds).toEqual(
        new Set(["h1", "h2", "h3", "h4", "h5"])
      );
    });

    it("handles single focused terminal node", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      // Focus on just the error node
      const result = findPathNodes(graph, "h1", ["h5"]);

      expect(result.nodeIds.has("h1")).toBe(true);
      expect(result.nodeIds.has("h3")).toBe(true);
      expect(result.nodeIds.has("h5")).toBe(true);
      expect(result.nodeIds.has("h2")).toBe(false);
      expect(result.nodeIds.has("h4")).toBe(false);
    });

    it("handles unreachable target gracefully", () => {
      const graph = makeGraph(diamondNodes, diamondEdges);
      const result = findPathNodes(graph, "h1", ["nonexistent"]);
      // Entry is forward-reachable but nonexistent is not reverse-reachable to entry
      expect(result.nodeIds.size).toBe(0);
    });

    it("handles multi-layer graph (handler → service → dao)", () => {
      const nodes: FlowNode[] = [
        { id: "h1", type: "entry", layer: "handler", label: "entry" },
        { id: "h2", type: "action", layer: "handler", label: "call svc" },
        { id: "s1", type: "action", layer: "service", label: "svc method" },
        { id: "d1", type: "action", layer: "dao", label: "db query" },
        { id: "s2", type: "return", layer: "service", label: "svc return" },
        { id: "h3", type: "return", layer: "handler", label: "handler return" },
        { id: "s3", type: "error", layer: "service", label: "svc error" },
        { id: "h4", type: "error", layer: "handler", label: "handler error" },
      ];
      const edges: FlowEdge[] = [
        { from: "h1", to: "h2" },
        { from: "h2", to: "s1" },
        { from: "s1", to: "d1" },
        { from: "d1", to: "s2" },
        { from: "s2", to: "h3" },
        { from: "s1", to: "s3", type: "error" },
        { from: "s3", to: "h4" },
      ];
      const graph = makeGraph(nodes, edges);

      // Success path
      const success = findPathNodes(graph, "h1", ["h3"]);
      expect(success.nodeIds).toEqual(
        new Set(["h1", "h2", "s1", "d1", "s2", "h3"])
      );

      // Error path
      const error = findPathNodes(graph, "h1", ["h4"]);
      expect(error.nodeIds).toEqual(
        new Set(["h1", "h2", "s1", "s3", "h4"])
      );
    });
  });
});
