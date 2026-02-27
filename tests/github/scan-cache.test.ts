import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getScanCache,
  setScanCache,
  clearScanCache,
  getFlowCache,
  setFlowCache,
} from "../../src/lib/github/scan-cache";
import type { HandlerFileEntry } from "../../src/lib/github/scan-cache";
import type { FileTreeEntry } from "../../src/types";

const mockHandlers = [
  {
    id: "test-handler",
    method: "GET" as const,
    path: "/test",
    functionName: "testHandler",
    file: "test.ts",
    serviceRefs: [],
    complexity: 0,
  },
];

const mockFileTree: FileTreeEntry[] = [
  { path: "src/handlers/test.ts", type: "blob" as const, sha: "abc123" },
  { path: "src/services/test.service.ts", type: "blob" as const, sha: "def456" },
];

const mockHandlerFiles = new Map<string, HandlerFileEntry>([
  ["src/handlers/test.ts", { content: "export class TestHandler {}", sha: "abc123" }],
]);

describe("scan-cache", () => {
  beforeEach(() => {
    clearScanCache("owner", "repo");
  });

  it("should return null for non-existent cache", () => {
    const result = getScanCache("owner", "repo");
    expect(result).toBeNull();
  });

  it("should store and retrieve cache entries", () => {
    setScanCache("owner", "repo", {
      fileTree: mockFileTree,
      handlerFiles: mockHandlerFiles,
      handlers: mockHandlers,
      branch: "main",
    });
    const result = getScanCache("owner", "repo");

    expect(result).not.toBeNull();
    expect(result!.handlers).toEqual(mockHandlers);
    expect(result!.fileTree).toEqual(mockFileTree);
    expect(result!.handlerFiles).toEqual(mockHandlerFiles);
    expect(result!.branch).toBe("main");
  });

  it("should differentiate cache keys by owner/repo", () => {
    setScanCache("owner1", "repo1", {
      fileTree: mockFileTree,
      handlerFiles: mockHandlerFiles,
      handlers: mockHandlers,
      branch: "main",
    });

    expect(getScanCache("owner1", "repo1")).not.toBeNull();
    expect(getScanCache("owner2", "repo1")).toBeNull();
    expect(getScanCache("owner1", "repo2")).toBeNull();
  });

  it("should clear cache for specific repo", () => {
    setScanCache("owner", "repo", {
      fileTree: mockFileTree,
      handlerFiles: mockHandlerFiles,
      handlers: mockHandlers,
      branch: "main",
    });
    clearScanCache("owner", "repo");

    expect(getScanCache("owner", "repo")).toBeNull();
  });

  it("should expire entries after TTL", () => {
    vi.useFakeTimers();

    setScanCache("owner", "repo", {
      fileTree: mockFileTree,
      handlerFiles: mockHandlerFiles,
      handlers: mockHandlers,
      branch: "main",
    });
    expect(getScanCache("owner", "repo")).not.toBeNull();

    // Advance time by 11 minutes (past the 10-minute TTL)
    vi.advanceTimersByTime(11 * 60 * 1000);

    expect(getScanCache("owner", "repo")).toBeNull();

    vi.useRealTimers();
  });

  it("should not expire entries before TTL", () => {
    vi.useFakeTimers();

    setScanCache("owner", "repo", {
      fileTree: mockFileTree,
      handlerFiles: mockHandlerFiles,
      handlers: mockHandlers,
      branch: "main",
    });

    // Advance time by 9 minutes (before the 10-minute TTL)
    vi.advanceTimersByTime(9 * 60 * 1000);

    expect(getScanCache("owner", "repo")).not.toBeNull();

    vi.useRealTimers();
  });
});

describe("flow-cache", () => {
  beforeEach(() => {
    clearScanCache("owner", "repo");
  });

  const mockFlowGraph = {
    nodes: [{ id: "n1", label: "handler", type: "handler" as const, layer: "handler" as const }],
    edges: [],
    metadata: { handlerId: "test-handler", method: "GET" as const, path: "/test" },
  };

  const mockParser = {
    scanHandlers: vi.fn(),
    buildFlowGraph: vi.fn(),
  } as unknown as import("../../src/lib/parser").CodeFlowParser;

  it("should return null when no scan cache exists", () => {
    const result = getFlowCache("owner", "repo", "test-handler");
    expect(result).toBeNull();
  });

  it("should return null when handler not cached", () => {
    setScanCache("owner", "repo", {
      fileTree: mockFileTree,
      handlerFiles: mockHandlerFiles,
      handlers: mockHandlers,
      branch: "main",
    });

    const result = getFlowCache("owner", "repo", "non-existent");
    expect(result).toBeNull();
  });

  it("should store and retrieve flow cache entries", () => {
    setScanCache("owner", "repo", {
      fileTree: mockFileTree,
      handlerFiles: mockHandlerFiles,
      handlers: mockHandlers,
      branch: "main",
    });

    setFlowCache("owner", "repo", "test-handler", {
      parser: mockParser,
      flowGraph: mockFlowGraph,
    });

    const result = getFlowCache("owner", "repo", "test-handler");
    expect(result).not.toBeNull();
    expect(result!.flowGraph).toEqual(mockFlowGraph);
  });

  it("should expire flow cache with scan cache TTL", () => {
    vi.useFakeTimers();

    setScanCache("owner", "repo", {
      fileTree: mockFileTree,
      handlerFiles: mockHandlerFiles,
      handlers: mockHandlers,
      branch: "main",
    });

    setFlowCache("owner", "repo", "test-handler", {
      parser: mockParser,
      flowGraph: mockFlowGraph,
    });

    vi.advanceTimersByTime(11 * 60 * 1000);

    expect(getFlowCache("owner", "repo", "test-handler")).toBeNull();

    vi.useRealTimers();
  });

  it("should not set flow cache when scan cache does not exist", () => {
    setFlowCache("owner", "repo", "test-handler", {
      parser: mockParser,
      flowGraph: mockFlowGraph,
    });

    // Should not throw, just silently skip
    expect(getFlowCache("owner", "repo", "test-handler")).toBeNull();
  });
});
