import {
  Node,
  SyntaxKind,
  type ArrowFunction,
  type FunctionDeclaration,
  type MethodDeclaration,
} from "ts-morph";
import type { Layer } from "@/types";

export interface TracedCall {
  objectName: string;
  methodName: string;
  fullExpression: string;
  layer: Layer;
  line: number;
  column: number;
  isInternalCall?: boolean;
}

type FunctionLike = FunctionDeclaration | MethodDeclaration | ArrowFunction;

export function traceServiceCalls(fn: FunctionLike): TracedCall[] {
  const calls: TracedCall[] = [];

  const callExpressions = fn.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expression = call.getExpression();

    if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) {
      continue;
    }

    const propAccess = expression.asKind(SyntaxKind.PropertyAccessExpression)!;
    const methodName = propAccess.getName();
    const objectExpr = propAccess.getExpression();

    let objectName = resolveObjectName(objectExpr);
    let isInternalCall = false;

    if (!objectName) {
      if (objectExpr.getKind() === SyntaxKind.ThisKeyword) {
        isInternalCall = true;
        objectName = "this";
      } else {
        continue;
      }
    }

    const layer = isInternalCall ? "service" : inferLayer(objectName);
    if (!isInternalCall && !layer) continue;

    calls.push({
      objectName,
      methodName,
      fullExpression: `${objectName}.${methodName}()`,
      layer: layer || "service",
      line: call.getStartLineNumber(),
      column: call.getStart() - call.getStartLinePos(),
      isInternalCall,
    });
  }

  // Sort by line number to preserve call order
  calls.sort((a, b) => a.line - b.line || a.column - b.column);

  return calls;
}

function resolveObjectName(node: Node): string | null {
  // Direct identifier: `enrollmentService.create()`
  if (node.getKind() === SyntaxKind.Identifier) {
    return node.getText();
  }

  // Property access on `this`: `this.ticketDao.findById()`
  if (node.getKind() === SyntaxKind.PropertyAccessExpression) {
    const propAccess = node.asKind(SyntaxKind.PropertyAccessExpression)!;
    const parent = propAccess.getExpression();

    if (parent.getKind() === SyntaxKind.ThisKeyword) {
      return propAccess.getName();
    }
  }

  return null;
}

function inferLayer(objectName: string): Layer | null {
  const lower = objectName.toLowerCase();

  if (lower.endsWith("service")) {
    return "service";
  }

  if (lower.endsWith("dao") || lower.endsWith("repository")) {
    return "dao";
  }

  return null;
}
