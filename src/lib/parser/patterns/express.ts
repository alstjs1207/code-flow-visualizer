import { SourceFile, SyntaxKind, CallExpression } from "ts-morph";

export interface ExpressRoute {
  method: string;
  path: string;
  handlerName: string;
  line: number;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

export function findExpressRoutes(sourceFile: SourceFile): ExpressRoute[] {
  const routes: ExpressRoute[] = [];

  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  );

  for (const call of callExpressions) {
    const route = parseRouterCall(call);
    if (route) {
      routes.push(route);
    }
  }

  return routes;
}

function parseRouterCall(call: CallExpression): ExpressRoute | null {
  const expression = call.getExpression();

  // Match pattern: router.get(...), router.post(...), etc.
  if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) {
    return null;
  }

  const propAccess = expression.asKind(SyntaxKind.PropertyAccessExpression)!;
  const methodName = propAccess.getName().toLowerCase();

  if (!HTTP_METHODS.has(methodName)) {
    return null;
  }

  const args = call.getArguments();
  if (args.length < 2) {
    return null;
  }

  // First arg: path string
  const pathArg = args[0];
  let path: string | null = null;
  if (pathArg.getKind() === SyntaxKind.StringLiteral) {
    path = pathArg.asKind(SyntaxKind.StringLiteral)!.getLiteralValue();
  }

  if (!path) return null;

  // Last arg: handler function reference or inline function
  const handlerArg = args[args.length - 1];
  let handlerName = "";

  if (handlerArg.getKind() === SyntaxKind.Identifier) {
    handlerName = handlerArg.getText();
  } else if (
    handlerArg.getKind() === SyntaxKind.ArrowFunction ||
    handlerArg.getKind() === SyntaxKind.FunctionExpression
  ) {
    handlerName = `anonymous_${methodName}_handler`;
  }

  return {
    method: methodName.toUpperCase(),
    path,
    handlerName,
    line: call.getStartLineNumber(),
  };
}
