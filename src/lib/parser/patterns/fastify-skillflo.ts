import { SourceFile, SyntaxKind, Node } from "ts-morph";

export interface SkillfloRoute {
  functionName: string;   // "find", "get", "create", "update", "remove"
  httpMethod: string;     // "GET", "POST", "PUT", "DELETE"
  path: string;           // "/member" or "/member/:id"
  line: number;
  className?: string;
}

const CRUD_METHOD_MAP: Record<string, { method: string; pathSuffix: string }> = {
  find:   { method: "GET",    pathSuffix: "" },
  get:    { method: "GET",    pathSuffix: "/:id" },
  create: { method: "POST",   pathSuffix: "" },
  update: { method: "PUT",    pathSuffix: "/:id" },
  remove: { method: "DELETE", pathSuffix: "/:id" },
};

/**
 * Detect skillflo-style CRUD handlers that use a bindRoute() method
 * with this.find(schema), this.get(schema), this.create(schema), etc.
 */
export function findSkillfloRoutes(sourceFile: SourceFile): SkillfloRoute[] {
  const routes: SkillfloRoute[] = [];

  for (const cls of sourceFile.getClasses()) {
    const className = cls.getName();

    // Find bindRoute method or arrow function property
    const bindRouteBody = findBindRouteBody(cls);
    if (!bindRouteBody) continue;

    // Extract this.routePath = "/xxx" assignment
    const routePath = extractRoutePath(bindRouteBody);
    if (!routePath) continue;

    // Find this.xxx(...) calls that match CRUD_METHOD_MAP
    const callExpressions = bindRouteBody.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );

    for (const call of callExpressions) {
      const expr = call.getExpression();
      if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

      const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression)!;
      const methodName = propAccess.getName();
      const obj = propAccess.getExpression();

      if (obj.getKind() !== SyntaxKind.ThisKeyword) continue;

      const mapping = CRUD_METHOD_MAP[methodName];
      if (!mapping) continue;

      routes.push({
        functionName: methodName,
        httpMethod: mapping.method,
        path: routePath + mapping.pathSuffix,
        line: call.getStartLineNumber(),
        className,
      });
    }
  }

  return routes;
}

function findBindRouteBody(cls: Node): Node | undefined {
  // Check class methods
  const classDecl = cls.asKind(SyntaxKind.ClassDeclaration);
  if (!classDecl) return undefined;

  for (const method of classDecl.getMethods()) {
    if (method.getName() === "bindRoute") {
      return method.getBody();
    }
  }

  // Check arrow function properties
  for (const prop of classDecl.getProperties()) {
    if (prop.getName() !== "bindRoute") continue;
    const init = prop.getInitializer();
    if (init?.getKind() === SyntaxKind.ArrowFunction) {
      return init.asKind(SyntaxKind.ArrowFunction)!.getBody();
    }
  }

  return undefined;
}

function extractRoutePath(body: Node): string | undefined {
  const assignments = body.getDescendantsOfKind(SyntaxKind.BinaryExpression);

  for (const expr of assignments) {
    if (expr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;

    const left = expr.getLeft();
    if (left.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const propAccess = left.asKind(SyntaxKind.PropertyAccessExpression)!;
    if (propAccess.getExpression().getKind() !== SyntaxKind.ThisKeyword) continue;
    if (propAccess.getName() !== "routePath") continue;

    const right = expr.getRight();
    if (right.getKind() === SyntaxKind.StringLiteral) {
      return right.asKind(SyntaxKind.StringLiteral)!.getLiteralValue();
    }
  }

  return undefined;
}
