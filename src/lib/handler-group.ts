import type { HandlerEntry } from "@/types";

const SKIP_SEGMENTS = new Set([
  "api",
  "b2e",
  "b2m",
  "backoffice",
  "external",
  "internal",
  "v1",
  "v2",
  "v3",
  "admin",
  "public",
  "private",
]);

/**
 * Extract domain group name from a handler path.
 * Skips known prefix segments and returns the first meaningful segment.
 *
 * "/api/b2e/member/sign-up" → "member"
 * "/api/backoffice/order/:id" → "order"
 * "/member" → "member"
 */
export function extractDomainGroup(path: string): string {
  const segments = path
    .split("/")
    .filter((s) => s !== "" && !s.startsWith(":"));

  for (const seg of segments) {
    if (!SKIP_SEGMENTS.has(seg.toLowerCase())) {
      return seg.toLowerCase();
    }
  }

  return "other";
}

/**
 * Group handlers by domain extracted from their path.
 * Groups are sorted alphabetically by group name.
 */
export function groupHandlers(
  handlers: HandlerEntry[]
): Map<string, HandlerEntry[]> {
  const map = new Map<string, HandlerEntry[]>();

  for (const handler of handlers) {
    const group = extractDomainGroup(handler.path);
    const list = map.get(group);
    if (list) {
      list.push(handler);
    } else {
      map.set(group, [handler]);
    }
  }

  // Sort by group name alphabetically
  const sorted = new Map(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  );

  return sorted;
}
