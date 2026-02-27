export interface PathMapping {
  prefix: string;
  hasWildcard: boolean;
  replacements: string[];
}

export type PathMappings = PathMapping[];

export interface TsconfigParseResult {
  mappings: PathMappings;
  extends?: string;
}

/**
 * Parse tsconfig.json content and extract path mappings.
 * Handles JSON with comments and trailing commas (both common in tsconfig).
 */
export function parseTsconfigPaths(tsconfigContent: string): PathMappings {
  return parseTsconfigWithMeta(tsconfigContent).mappings;
}

/**
 * Parse tsconfig.json content and return both path mappings and metadata
 * (e.g. the `extends` field for chain resolution).
 */
export function parseTsconfigWithMeta(tsconfigContent: string): TsconfigParseResult {
  // Strip comments while respecting JSON string literals.
  // Naive regex can mistake "/*" inside strings (e.g. "@api/*") as comment start.
  const stripped = stripJsonComments(tsconfigContent);

  // Remove orphan commas left after comment stripping (e.g. lines that were
  // entirely comments but had trailing commas) and trailing commas before } or ]
  const cleaned = stripped
    .replace(/,(\s*,)+/g, ",")   // collapse consecutive commas: ",\n,\n," → ","
    .replace(/,(\s*[}\]])/g, "$1"); // remove trailing comma before } or ]

  let parsed: { extends?: string; compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { mappings: [] };
  }

  const extendsField = parsed.extends;

  const paths = parsed.compilerOptions?.paths;
  if (!paths) return { mappings: [], extends: extendsField };

  const baseUrl = parsed.compilerOptions?.baseUrl ?? ".";

  const mappings: PathMappings = [];

  for (const [pattern, replacements] of Object.entries(paths)) {
    const hasWildcard = pattern.includes("*");
    const prefix = hasWildcard ? pattern.replace("/*", "") : pattern;

    const resolvedReplacements = replacements.map((r) => {
      // Normalize baseUrl: strip leading "./" if present
      const normalizedBase = baseUrl === "." ? "" : baseUrl.replace(/^\.\//, "").replace(/\/$/, "");

      // Strip leading "./" from the replacement
      const normalizedReplacement = r.replace(/^\.\//, "");

      // Remove trailing wildcard from the replacement
      const withoutWildcard = hasWildcard
        ? normalizedReplacement.replace(/\/?\*$/, "")
        : normalizedReplacement;

      if (normalizedBase && withoutWildcard) {
        return `${normalizedBase}/${withoutWildcard}`;
      }
      return normalizedBase || withoutWildcard;
    });

    mappings.push({ prefix, hasWildcard, replacements: resolvedReplacements });
  }

  // Sort by prefix length descending (more specific patterns first)
  mappings.sort((a, b) => b.prefix.length - a.prefix.length);

  return { mappings, extends: extendsField };
}

/**
 * Resolve an import path using path mappings.
 * Returns a repo-relative path (without extension) or null if no mapping matches.
 */
export function resolvePathAlias(
  importPath: string,
  mappings: PathMappings
): string | null {
  for (const mapping of mappings) {
    if (mapping.hasWildcard) {
      // Wildcard match: "@/*" matches "@/services/user.service"
      const matchPrefix = mapping.prefix + "/";
      if (importPath === mapping.prefix || importPath.startsWith(matchPrefix)) {
        const rest = importPath.startsWith(matchPrefix)
          ? importPath.slice(matchPrefix.length)
          : "";
        // Use the first replacement
        const base = mapping.replacements[0];
        return rest ? `${base}/${rest}` : base;
      }
    } else {
      // Exact match
      if (importPath === mapping.prefix) {
        return mapping.replacements[0];
      }
    }
  }

  return null;
}

/**
 * Strip single-line (//) and multi-line comments from JSON-with-comments,
 * while preserving characters inside JSON string literals (e.g. "@api/*").
 */
function stripJsonComments(text: string): string {
  let result = "";
  let i = 0;

  while (i < text.length) {
    // JSON string literal — walk to the closing quote, respecting escapes
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j++; // skip escaped char
        j++;
      }
      result += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // Single-line comment
    if (text[i] === '/' && text[i + 1] === '/') {
      // Skip to end of line
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    // Multi-line comment
    if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2; // skip closing */
      continue;
    }

    result += text[i];
    i++;
  }

  return result;
}
