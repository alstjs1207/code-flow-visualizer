import type { Octokit } from "@octokit/rest";
import micromatch from "micromatch";
import type { FileTreeEntry } from "@/types";
import type { PathMappings } from "@/lib/github/tsconfig-paths";
import { resolvePathAlias } from "@/lib/github/tsconfig-paths";

const DEFAULT_HANDLER_PATTERNS = [
  "**/*.handler.ts",
  "**/*.controller.ts",
  "**/*-handler.ts",
  "**/*-crud-handler.ts",
  "**/handlers/**/*.ts",
  "**/controllers/**/*.ts",
  "**/routes/**/*.ts",
];

/**
 * Fetch the full file tree of a repository using the Git Trees API.
 */
export async function fetchFileTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<FileTreeEntry[]> {
  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "true",
  });

  return (data.tree as FileTreeEntry[]).filter(
    (entry) => entry.type === "blob" && entry.path.endsWith(".ts")
  );
}

/**
 * Filter file tree entries to find handler candidates using glob patterns.
 */
export function filterHandlerFiles(
  entries: FileTreeEntry[],
  patterns: string[] = DEFAULT_HANDLER_PATTERNS
): FileTreeEntry[] {
  const paths = entries.map((e) => e.path);
  const matched = micromatch(paths, patterns);
  return entries.filter((e) => matched.includes(e.path));
}

/**
 * Fetch file contents in batches (10 concurrent requests).
 * Returns a Map of path → content.
 */
export async function fetchFileContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  paths: string[],
  ref?: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const batchSize = 10;

  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const responses = await Promise.all(
      batch.map(async (path) => {
        try {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path,
            ...(ref ? { ref } : {}),
          });

          if ("content" in data && data.encoding === "base64") {
            const content = Buffer.from(data.content, "base64").toString(
              "utf-8"
            );
            return { path, content };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    for (const res of responses) {
      if (res) {
        result.set(res.path, res.content);
      }
    }
  }

  return result;
}

/**
 * Extract imported file paths from handler source files.
 * Looks for relative import statements and resolves them against the file tree.
 */
export function findReferencedFiles(
  handlerFiles: Map<string, string>,
  allEntries: FileTreeEntry[],
  pathMappings: PathMappings = []
): string[] {
  const importPaths = new Set<string>();
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const allPaths = allEntries.map((e) => e.path);

  for (const [filePath, content] of handlerFiles) {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      let resolved: string | undefined;
      if (importPath.startsWith(".")) {
        resolved = resolveRelativePath(dir, importPath);
      } else if (pathMappings.length > 0) {
        const aliasResolved = resolvePathAlias(importPath, pathMappings);
        if (aliasResolved) resolved = aliasResolved;
      }
      if (!resolved) continue;

      // Try exact match, then with .ts extension
      const candidates = [
        resolved,
        `${resolved}.ts`,
        `${resolved}/index.ts`,
      ];

      for (const candidate of candidates) {
        if (
          allPaths.includes(candidate) &&
          !handlerFiles.has(candidate)
        ) {
          importPaths.add(candidate);
        }
      }
    }
  }

  return Array.from(importPaths);
}

/**
 * Like findReferencedFiles, but scans only sourceFiles for imports,
 * and excludes any paths already in excludeFiles from the results.
 */
function findReferencedFilesExcluding(
  sourceFiles: Map<string, string>,
  allEntries: FileTreeEntry[],
  excludeFiles: Map<string, string>,
  pathMappings: PathMappings = []
): string[] {
  const importPaths = new Set<string>();
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const allPaths = allEntries.map((e) => e.path);

  for (const [filePath, content] of sourceFiles) {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      let resolved: string | undefined;
      if (importPath.startsWith(".")) {
        resolved = resolveRelativePath(dir, importPath);
      } else if (pathMappings.length > 0) {
        const aliasResolved = resolvePathAlias(importPath, pathMappings);
        if (aliasResolved) resolved = aliasResolved;
      }
      if (!resolved) continue;

      const candidates = [resolved, `${resolved}.ts`, `${resolved}/index.ts`];

      for (const candidate of candidates) {
        if (allPaths.includes(candidate) && !excludeFiles.has(candidate)) {
          importPaths.add(candidate);
        }
      }
    }
  }

  return Array.from(importPaths);
}

/**
 * Recursively fetch referenced files starting from seed files.
 * Follows imports up to maxDepth levels deep.
 * Circular imports are naturally prevented by the collected map.
 */
export async function fetchReferencedFilesRecursive(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  seedFiles: Map<string, string>,
  allEntries: FileTreeEntry[],
  maxDepth = 3,
  pathMappings: PathMappings = []
): Promise<Map<string, string>> {
  const collected = new Map(seedFiles);
  let frontier = new Map(seedFiles);

  for (let depth = 0; depth < maxDepth; depth++) {
    const newPaths = findReferencedFilesExcluding(
      frontier,
      allEntries,
      collected,
      pathMappings
    );

    if (newPaths.length === 0) break;

    const newFiles = await fetchFileContents(
      octokit,
      owner,
      repo,
      newPaths,
      ref
    );

    for (const [path, content] of newFiles) {
      collected.set(path, content);
    }

    frontier = newFiles;
  }

  return collected;
}

function resolveRelativePath(dir: string, importPath: string): string {
  const parts = dir.split("/").filter(Boolean);
  const segments = importPath.split("/");

  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }

  return parts.join("/");
}
