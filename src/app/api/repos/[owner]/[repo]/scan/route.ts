import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";
import { createOctokit } from "@/lib/github/client";
import {
  fetchFileTree,
  filterHandlerFiles,
  fetchFileContents,
} from "@/lib/github/file-fetcher";
import { setScanCache } from "@/lib/github/scan-cache";
import type { HandlerFileEntry } from "@/lib/github/scan-cache";
import { CodeFlowParser } from "@/lib/parser";
import { parseTsconfigWithMeta } from "@/lib/github/tsconfig-paths";
import type { PathMappings } from "@/lib/github/tsconfig-paths";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, repo } = await params;
  const searchParams = request.nextUrl.searchParams;
  const patternsParam = searchParams.get("patterns");
  const branch = searchParams.get("branch") || "main";

  const patterns = patternsParam
    ? patternsParam.split(",").map((p) => p.trim())
    : undefined;

  try {
    const octokit = createOctokit(accessToken);

    // Step 1: Fetch full file tree
    const allEntries = await fetchFileTree(octokit, owner, repo, branch);

    // Step 2: Fetch tsconfig.json for path alias resolution (follows extends chain)
    let pathMappings: PathMappings = [];
    try {
      const tsconfigContents = await fetchFileContents(octokit, owner, repo, ["tsconfig.json"], branch);
      const tsconfigContent = tsconfigContents.get("tsconfig.json");
      if (tsconfigContent) {
        const result = parseTsconfigWithMeta(tsconfigContent);
        pathMappings = result.mappings;

        // Follow extends chain to inherit path mappings from parent tsconfig
        if (result.extends && pathMappings.length === 0) {
          let extendsPath = result.extends;
          const visited = new Set<string>(["tsconfig.json"]);
          const MAX_EXTENDS_DEPTH = 3;

          for (let depth = 0; depth < MAX_EXTENDS_DEPTH; depth++) {
            // Resolve the extends path relative to the current tsconfig directory
            // Common patterns: "./tsconfig.base.json", "../tsconfig.json", "tsconfig.base.json"
            const resolved = extendsPath.replace(/^\.\//, "");
            if (visited.has(resolved)) break;
            visited.add(resolved);

            try {
              const parentContents = await fetchFileContents(octokit, owner, repo, [resolved], branch);
              const parentContent = parentContents.get(resolved);
              if (!parentContent) break;

              const parentResult = parseTsconfigWithMeta(parentContent);
              if (parentResult.mappings.length > 0) {
                // Merge: parent mappings are used as base, child overrides
                const childPrefixes = new Set(pathMappings.map((m) => m.prefix));
                for (const parentMapping of parentResult.mappings) {
                  if (!childPrefixes.has(parentMapping.prefix)) {
                    pathMappings.push(parentMapping);
                  }
                }
                // Re-sort by prefix length descending
                pathMappings.sort((a, b) => b.prefix.length - a.prefix.length);
                break;
              }

              if (parentResult.extends) {
                extendsPath = parentResult.extends;
              } else {
                break;
              }
            } catch {
              break;
            }
          }
        }
      }
    } catch { /* proceed without aliases */ }

    // Step 3: Filter handler candidates by glob patterns
    const handlerEntries = filterHandlerFiles(allEntries, patterns);

    if (handlerEntries.length === 0) {
      return NextResponse.json({
        handlers: [],
        fileCount: 0,
        message: "No handler files found matching the patterns.",
      });
    }

    // Step 3: Fetch handler file contents only (no service/DAO)
    const handlerPaths = handlerEntries.map((e) => e.path);
    const handlerContents = await fetchFileContents(
      octokit,
      owner,
      repo,
      handlerPaths,
      branch
    );

    // Step 4: Parse handlers only
    const parser = new CodeFlowParser(handlerContents);
    const handlers = parser.scanHandlers();

    // Step 5: Build handlerFiles map with sha for cache
    const handlerFiles = new Map<string, HandlerFileEntry>();
    for (const entry of handlerEntries) {
      const content = handlerContents.get(entry.path);
      if (content) {
        handlerFiles.set(entry.path, { content, sha: entry.sha });
      }
    }

    // Step 6: Cache the result (lightweight — no service/DAO files)
    setScanCache(owner, repo, {
      fileTree: allEntries,
      handlerFiles,
      handlers,
      branch,
      pathMappings,
    });

    return NextResponse.json({
      handlers,
      fileCount: handlerContents.size,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
