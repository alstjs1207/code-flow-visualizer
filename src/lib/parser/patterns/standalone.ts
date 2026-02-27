import { SourceFile, SyntaxKind } from "ts-morph";
import type { HttpMethod } from "@/types";

export interface StandaloneHandler {
  functionName: string;
  method: HttpMethod;
  path: string;
  line: number;
}

const METHOD_PREFIXES: Record<string, HttpMethod> = {
  create: "POST",
  add: "POST",
  insert: "POST",
  register: "POST",
  get: "GET",
  find: "GET",
  list: "GET",
  fetch: "GET",
  load: "GET",
  read: "GET",
  search: "GET",
  update: "PATCH",
  edit: "PATCH",
  modify: "PATCH",
  patch: "PATCH",
  put: "PUT",
  replace: "PUT",
  set: "PUT",
  upsert: "PUT",
  delete: "DELETE",
  remove: "DELETE",
  destroy: "DELETE",
};

export function inferHttpMethod(functionName: string): HttpMethod {
  const lower = functionName.toLowerCase();
  for (const [prefix, method] of Object.entries(METHOD_PREFIXES)) {
    if (lower.startsWith(prefix)) {
      return method;
    }
  }
  return "POST";
}

export function findStandaloneHandlers(
  sourceFile: SourceFile
): StandaloneHandler[] {
  const handlers: StandaloneHandler[] = [];

  for (const fn of sourceFile.getFunctions()) {
    if (!fn.isExported()) continue;

    const params = fn.getParameters();
    if (params.length < 2) continue;

    const first = params[0];
    const second = params[1];

    const isReqParam = isRequestParam(first);
    const isResParam = isResponseParam(second);

    if (!isReqParam || !isResParam) continue;

    const name = fn.getName();
    if (!name) continue;

    handlers.push({
      functionName: name,
      method: inferHttpMethod(name),
      path: "/",
      line: fn.getStartLineNumber(),
    });
  }

  return handlers;
}

function isRequestParam(
  param: ReturnType<SourceFile["getFunctions"]>[0]["getParameters"] extends () => (infer P)[] ? P : never
): boolean {
  const name = param.getName().toLowerCase();
  if (name === "req" || name === "request") return true;

  const typeNode = param.getTypeNode();
  if (typeNode && typeNode.getText().includes("Request")) return true;

  return false;
}

function isResponseParam(
  param: ReturnType<SourceFile["getFunctions"]>[0]["getParameters"] extends () => (infer P)[] ? P : never
): boolean {
  const name = param.getName().toLowerCase();
  if (name === "res" || name === "response") return true;

  const typeNode = param.getTypeNode();
  if (typeNode && typeNode.getText().includes("Response")) return true;

  return false;
}
