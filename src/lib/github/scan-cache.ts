import type { HandlerEntry, FileTreeEntry, FlowGraph } from "@/types";
import type { CodeFlowParser } from "@/lib/parser";
import type { PathMappings } from "@/lib/github/tsconfig-paths";

export interface HandlerFileEntry {
  content: string;
  sha: string;
}

export interface FlowCacheEntry {
  parser: CodeFlowParser;
  flowGraph: FlowGraph;
}

interface CacheEntry {
  fileTree: FileTreeEntry[];
  handlerFiles: Map<string, HandlerFileEntry>;
  handlers: HandlerEntry[];
  owner: string;
  repo: string;
  branch: string;
  pathMappings: PathMappings;
  flowCache: Map<string, FlowCacheEntry>;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const globalForCache = globalThis as typeof globalThis & {
  __scanCache?: Map<string, CacheEntry>;
};
const cache = globalForCache.__scanCache ?? (globalForCache.__scanCache = new Map());

function cacheKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

export function getScanCache(
  owner: string,
  repo: string
): Omit<CacheEntry, "flowCache"> | null {
  const key = cacheKey(owner, repo);
  const entry = cache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(key);
    return null;
  }

  const { flowCache: _, ...rest } = entry;
  return rest;
}

export function setScanCache(
  owner: string,
  repo: string,
  data: {
    fileTree: FileTreeEntry[];
    handlerFiles: Map<string, HandlerFileEntry>;
    handlers: HandlerEntry[];
    branch: string;
    pathMappings?: PathMappings;
  }
): void {
  const key = cacheKey(owner, repo);
  cache.set(key, {
    ...data,
    pathMappings: data.pathMappings ?? [],
    owner,
    repo,
    flowCache: new Map(),
    createdAt: Date.now(),
  });
}

export function getFlowCache(
  owner: string,
  repo: string,
  handlerId: string
): FlowCacheEntry | null {
  const key = cacheKey(owner, repo);
  const entry = cache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.flowCache.get(handlerId) ?? null;
}

export function setFlowCache(
  owner: string,
  repo: string,
  handlerId: string,
  flowEntry: FlowCacheEntry
): void {
  const key = cacheKey(owner, repo);
  const entry = cache.get(key);

  if (!entry) return;

  entry.flowCache.set(handlerId, flowEntry);
}

export function clearScanCache(owner: string, repo: string): void {
  cache.delete(cacheKey(owner, repo));
}
