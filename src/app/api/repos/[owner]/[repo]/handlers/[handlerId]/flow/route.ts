import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";
import { createOctokit } from "@/lib/github/client";
import { fetchReferencedFilesRecursive } from "@/lib/github/file-fetcher";
import {
  getScanCache,
  getFlowCache,
  setFlowCache,
} from "@/lib/github/scan-cache";
import { CodeFlowParser } from "@/lib/parser";
import type { FileTreeEntry } from "@/types";
import type { PathMappings } from "@/lib/github/tsconfig-paths";
import { resolvePathAlias } from "@/lib/github/tsconfig-paths";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ owner: string; repo: string; handlerId: string }>;
  }
) {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, repo, handlerId } = await params;

  // 1. Check flow cache first
  const cachedFlow = getFlowCache(owner, repo, handlerId);
  if (cachedFlow) {
    return NextResponse.json(cachedFlow.flowGraph);
  }

  // 2. Get scan cache
  const cached = getScanCache(owner, repo);

  if (!cached) {
    return NextResponse.json(
      { error: "No scan cache found. Please scan the repository first." },
      { status: 404 }
    );
  }

  const handler = cached.handlers.find((h) => h.id === handlerId);

  if (!handler) {
    return NextResponse.json(
      { error: `Handler "${handlerId}" not found.` },
      { status: 404 }
    );
  }

  try {
    const debug: Record<string, unknown> = {};

    // 3. Find the handler file path — ts-morph prepends "/" to file paths,
    //    so we match by suffix against GitHub API paths (which have no leading "/")
    const handlerFilePath = findHandlerFilePath(handler.file, cached.handlerFiles);

    // Debug: handler resolution
    debug.handlerFound = !!handler;
    debug.handlerFile = handler.file;
    debug.handlerFilePath = handlerFilePath;

    if (!handlerFilePath) {
      return NextResponse.json(
        { error: `Handler file not found in cache.` },
        { status: 404 }
      );
    }

    // Debug: path mappings from tsconfig
    debug.pathMappings = cached.pathMappings;

    // 4. Build seed files from the handler file
    const seedFiles = new Map<string, string>();
    const handlerFileEntry = cached.handlerFiles.get(handlerFilePath);
    if (handlerFileEntry) {
      seedFiles.set(handlerFilePath, handlerFileEntry.content);
    }

    // Debug: import paths extracted from seed files
    debug.importPaths = getImportPaths(seedFiles, cached.fileTree, cached.pathMappings);

    // 5. Recursively fetch referenced service/DAO files (on-demand)
    const octokit = createOctokit(accessToken);
    const allFiles = await fetchReferencedFilesRecursive(
      octokit,
      owner,
      repo,
      cached.branch,
      seedFiles,
      cached.fileTree,
      3,
      cached.pathMappings
    );

    // Debug: fetched files
    debug.totalFilesInParser = allFiles.size;
    debug.fetchedFilePaths = Array.from(allFiles.keys());

    // Debug: service type map from handler entry
    debug.serviceTypeMap = handler.serviceTypeMap;

    // 6. Build flow graph (with debug collection)
    const parser = new CodeFlowParser(allFiles);
    const flowGraph = parser.buildFlowGraph(handler, debug);

    // 7. Cache the result
    setFlowCache(owner, repo, handlerId, { parser, flowGraph });

    return NextResponse.json({ ...flowGraph, _debug: debug });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build flow graph";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Extract raw import paths from source files for diagnostics.
 * Reuses the same regex pattern as file-fetcher.
 */
function getImportPaths(
  files: Map<string, string>,
  fileTree: FileTreeEntry[],
  pathMappings: PathMappings
): Array<{ file: string; importPath: string; resolved: string | null; foundInTree: boolean }> {
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const allPaths = fileTree.map((e) => e.path);
  const results: Array<{ file: string; importPath: string; resolved: string | null; foundInTree: boolean }> = [];

  for (const [filePath, content] of files) {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      let resolved: string | null = null;
      if (importPath.startsWith(".")) {
        // Resolve relative path
        const parts = dir.split("/").filter(Boolean);
        for (const segment of importPath.split("/")) {
          if (segment === ".") continue;
          if (segment === "..") parts.pop();
          else parts.push(segment);
        }
        resolved = parts.join("/");
      } else if (pathMappings.length > 0) {
        resolved = resolvePathAlias(importPath, pathMappings);
      }

      const foundInTree = resolved
        ? allPaths.some((p) => p === resolved || p === `${resolved}.ts` || p === `${resolved}/index.ts`)
        : false;

      results.push({ file: filePath, importPath, resolved, foundInTree });
    }
  }

  return results;
}

/**
 * Match handler file path from ts-morph (may have leading "/") to GitHub API paths.
 */
function findHandlerFilePath(
  tsMorphPath: string,
  handlerFiles: Map<string, string | { content: string; sha: string }>
): string | null {
  // Direct match
  if (handlerFiles.has(tsMorphPath)) return tsMorphPath;

  // ts-morph adds leading "/" — try stripping it
  const stripped = tsMorphPath.startsWith("/")
    ? tsMorphPath.slice(1)
    : tsMorphPath;
  if (handlerFiles.has(stripped)) return stripped;

  // Suffix match as fallback
  for (const key of handlerFiles.keys()) {
    if (key.endsWith(stripped) || stripped.endsWith(key)) {
      return key;
    }
  }

  return null;
}
