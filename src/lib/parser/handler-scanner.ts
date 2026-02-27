import { Node, Project, SourceFile, SyntaxKind } from "ts-morph";
import type { HandlerEntry, HttpMethod } from "@/types";
import { findExpressRoutes } from "./patterns/express";
import {
  findFastifyRoutes,
  extractClassContext,
  type ClassContext,
} from "./patterns/fastify-class";
import { findSkillfloRoutes } from "./patterns/fastify-skillflo";
import { findStandaloneHandlers } from "./patterns/standalone";

export function scanHandlers(
  fileName: string,
  code: string
): HandlerEntry[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(fileName, code);

  return scanHandlersFromSourceFile(sourceFile);
}

export function scanHandlersFromSourceFile(
  sourceFile: SourceFile
): HandlerEntry[] {
  const expressRoutes = findExpressRoutes(sourceFile);
  const fastifyRoutes = findFastifyRoutes(sourceFile);
  const skillfloRoutes = findSkillfloRoutes(sourceFile);
  const fileName = sourceFile.getBaseName();

  if (expressRoutes.length > 0 || fastifyRoutes.length > 0 || skillfloRoutes.length > 0) {
    const entries: HandlerEntry[] = [];

    // Express routes
    for (let index = 0; index < expressRoutes.length; index++) {
      const route = expressRoutes[index];
      const fn = sourceFile.getFunction(route.handlerName);
      const serviceRefs = fn ? extractServiceRefs(fn) : [];
      const complexity = fn ? countBranches(fn) : 0;

      entries.push({
        id: `${fileName}:${route.handlerName}:${index}`,
        method: route.method as HttpMethod,
        path: route.path,
        functionName: route.handlerName,
        file: sourceFile.getFilePath(),
        serviceRefs,
        complexity,
      });
    }

    // Fastify routes
    const classContextCache = new Map<string, ClassContext | undefined>();

    for (let index = 0; index < fastifyRoutes.length; index++) {
      const route = fastifyRoutes[index];
      const functionName = `${route.memberName}_${route.httpMethod.toLowerCase()}`;
      const inlineHandler = findLastArrowFunctionArg(sourceFile, route);
      const serviceRefs = inlineHandler ? extractServiceRefs(inlineHandler) : [];
      const complexity = inlineHandler ? countBranches(inlineHandler) : 0;

      let resolvedPath = route.path;
      let rawPath: string | undefined;
      let serviceTypeMap: Record<string, string> | undefined;

      if (route.className) {
        if (!classContextCache.has(route.className)) {
          classContextCache.set(
            route.className,
            extractClassContext(sourceFile, route.className)
          );
        }
        const ctx = classContextCache.get(route.className);
        if (ctx) {
          // Build serviceTypeMap: property name → camelCase class name
          serviceTypeMap = {};
          for (const [prop, typeName] of Object.entries(ctx.propertyTypes)) {
            serviceTypeMap[prop] =
              typeName.charAt(0).toLowerCase() + typeName.slice(1);
          }

          // Resolve path: replace ${this.xxx} with resolved assignments
          const newPath = resolveRoutePath(route.path, ctx.resolvedAssignments);
          if (newPath !== route.path) {
            rawPath = route.path;
            resolvedPath = newPath;
          }
        }
      }

      entries.push({
        id: `${fileName}:${functionName}:${expressRoutes.length + index}`,
        method: route.httpMethod as HttpMethod,
        path: resolvedPath,
        functionName,
        file: sourceFile.getFilePath(),
        serviceRefs,
        complexity,
        ...(serviceTypeMap && { serviceTypeMap }),
        ...(rawPath && { rawPath }),
      });
    }

    // Skillflo CRUD routes (deduplicate by method+path against fastify routes)
    const existingKeys = new Set(
      entries.map((e) => `${e.method}:${e.path}`)
    );
    const skillfloOffset = expressRoutes.length + fastifyRoutes.length;

    for (let index = 0; index < skillfloRoutes.length; index++) {
      const route = skillfloRoutes[index];
      const key = `${route.httpMethod}:${route.path}`;
      if (existingKeys.has(key)) continue;

      let serviceTypeMap: Record<string, string> | undefined;

      if (route.className) {
        if (!classContextCache.has(route.className)) {
          classContextCache.set(
            route.className,
            extractClassContext(sourceFile, route.className)
          );
        }
        const ctx = classContextCache.get(route.className);
        if (ctx) {
          serviceTypeMap = {};
          for (const [prop, typeName] of Object.entries(ctx.propertyTypes)) {
            serviceTypeMap[prop] =
              typeName.charAt(0).toLowerCase() + typeName.slice(1);
          }
        }
      }

      entries.push({
        id: `${fileName}:${route.functionName}_${route.httpMethod.toLowerCase()}:${skillfloOffset + index}`,
        method: route.httpMethod as HttpMethod,
        path: route.path,
        functionName: `${route.functionName}_${route.httpMethod.toLowerCase()}`,
        file: sourceFile.getFilePath(),
        serviceRefs: [],
        complexity: 0,
        ...(serviceTypeMap && { serviceTypeMap }),
      });
    }

    return entries;
  }

  // Fallback: standalone exported handler functions
  const standaloneHandlers = findStandaloneHandlers(sourceFile);
  return standaloneHandlers.map((sh, index) => {
    const fn = sourceFile.getFunction(sh.functionName);
    const serviceRefs = fn ? extractServiceRefs(fn) : [];
    const complexity = fn ? countBranches(fn) : 0;

    return {
      id: `${fileName}:${sh.functionName}:${index}`,
      method: sh.method,
      path: sh.path,
      functionName: sh.functionName,
      file: sourceFile.getFilePath(),
      serviceRefs,
      complexity,
    };
  });
}

/**
 * Find the last ArrowFunction argument of a Fastify route call.
 */
function findLastArrowFunctionArg(
  sourceFile: SourceFile,
  route: { httpMethod: string; path: string; line: number }
): Node | undefined {
  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  );

  for (const call of callExpressions) {
    if (call.getStartLineNumber() !== route.line) continue;

    const args = call.getArguments();
    for (let i = args.length - 1; i >= 0; i--) {
      if (args[i].getKind() === SyntaxKind.ArrowFunction) {
        return args[i];
      }
    }
  }

  return undefined;
}

function resolveRoutePath(
  rawPath: string,
  assignments: Record<string, string>
): string {
  return rawPath.replace(/\$\{this\.(\w+)\}/g, (_match, propName) => {
    return assignments[propName] ?? _match;
  });
}

function extractServiceRefs(fn: Node | null | undefined): string[] {
  if (!fn) return [];

  const refs: string[] = [];
  const callExpressions = fn.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expression = call.getExpression();
    if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expression.asKind(
        SyntaxKind.PropertyAccessExpression
      )!;
      const objectExpr = propAccess.getExpression();
      const methodName = propAccess.getName();

      // Get object name (handles both `foo.bar()` and `this.foo.bar()`)
      let objectName = "";
      if (objectExpr.getKind() === SyntaxKind.PropertyAccessExpression) {
        const innerProp = objectExpr.asKind(
          SyntaxKind.PropertyAccessExpression
        )!;
        objectName = innerProp.getName();
      } else if (objectExpr.getKind() === SyntaxKind.Identifier) {
        objectName = objectExpr.getText();
      }

      if (objectName && isServiceOrDaoName(objectName)) {
        refs.push(`${objectName}.${methodName}`);
      }
    }
  }

  return refs;
}

function isServiceOrDaoName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith("service") ||
    lower.endsWith("dao") ||
    lower.endsWith("repository")
  );
}

function countBranches(fn: Node | null | undefined): number {
  if (!fn) return 0;

  let count = 0;
  count += fn.getDescendantsOfKind(SyntaxKind.IfStatement).length;
  count += fn.getDescendantsOfKind(SyntaxKind.ConditionalExpression).length;
  count += fn.getDescendantsOfKind(SyntaxKind.SwitchStatement).length;

  return count;
}
