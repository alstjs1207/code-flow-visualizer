import type { HttpMethod } from "./flow-graph";

export interface HandlerEntry {
  id: string;
  method: HttpMethod;
  path: string;
  functionName: string;
  file: string;
  serviceRefs: string[];
  complexity: number;
  serviceTypeMap?: Record<string, string>; // "service" → "accountService" (camelCase)
  rawPath?: string;                         // pre-resolution path (for AST matching)
}

export interface ScanError {
  file: string;
  message: string;
}

export interface RepoScanResult {
  repo: string;
  branch: string;
  scannedAt: string;
  handlers: HandlerEntry[];
  errors: ScanError[];
}
