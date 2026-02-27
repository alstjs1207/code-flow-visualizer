import { SourceFile, SyntaxKind, Node, type ArrowFunction } from "ts-morph";

export interface FastifyRoute {
  memberName: string;
  httpMethod: string;
  path: string;
  line: number;
  className?: string;
}

export interface ClassContext {
  propertyTypes: Record<string, string>;      // "service" → "AccountService"
  resolvedAssignments: Record<string, string>; // "routePath" → "/account"
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const SERVER_NAMES = new Set(["server", "app", "fastify"]);

export function findFastifyRoutes(sourceFile: SourceFile): FastifyRoute[] {
  const routes: FastifyRoute[] = [];

  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  );

  for (const call of callExpressions) {
    const expression = call.getExpression();

    // Match: this.server.get(...), this.app.post(...), this.fastify.delete(...)
    if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const outer = expression.asKind(SyntaxKind.PropertyAccessExpression)!;
    const httpMethod = outer.getName().toLowerCase();
    if (!HTTP_METHODS.has(httpMethod)) continue;

    const middle = outer.getExpression();
    if (middle.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const inner = middle.asKind(SyntaxKind.PropertyAccessExpression)!;
    const serverName = inner.getName().toLowerCase();
    if (!SERVER_NAMES.has(serverName)) continue;

    const thisExpr = inner.getExpression();
    if (thisExpr.getKind() !== SyntaxKind.ThisKeyword) continue;

    // Extract path from first argument
    const args = call.getArguments();
    const path = args.length > 0 ? extractPath(args[0]) : "/";

    // Determine containing member name
    const memberName = findContainingMemberName(call);

    // Determine containing class name (if any)
    const className = findContainingClassName(call);

    routes.push({
      memberName,
      httpMethod: httpMethod.toUpperCase(),
      path,
      line: call.getStartLineNumber(),
      className,
    });
  }

  return routes;
}

function extractPath(node: Node): string {
  if (node.getKind() === SyntaxKind.StringLiteral) {
    return node.asKind(SyntaxKind.StringLiteral)!.getLiteralValue();
  }

  if (node.getKind() === SyntaxKind.TemplateExpression) {
    // Return raw template text without backticks
    const text = node.getText();
    return text.slice(1, -1); // remove surrounding backticks
  }

  if (node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return node.asKind(SyntaxKind.NoSubstitutionTemplateLiteral)!.getLiteralValue();
  }

  return "/";
}

function findContainingMemberName(node: Node): string {
  let current: Node | undefined = node.getParent();

  while (current) {
    // Class property: find = (...) => { ... }
    if (current.getKind() === SyntaxKind.PropertyDeclaration) {
      const prop = current.asKind(SyntaxKind.PropertyDeclaration)!;
      return prop.getName();
    }

    // Top-level assignment: find = (...) => { ... }
    if (current.getKind() === SyntaxKind.BinaryExpression) {
      const binary = current.asKind(SyntaxKind.BinaryExpression)!;
      const left = binary.getLeft();
      if (left.getKind() === SyntaxKind.Identifier) {
        return left.getText();
      }
    }

    // Variable declaration: const find = (...) => { ... }
    if (current.getKind() === SyntaxKind.VariableDeclaration) {
      const decl = current.asKind(SyntaxKind.VariableDeclaration)!;
      return decl.getName();
    }

    current = current.getParent();
  }

  return "anonymous";
}

function findContainingClassName(node: Node): string | undefined {
  let current: Node | undefined = node.getParent();

  while (current) {
    if (current.getKind() === SyntaxKind.ClassDeclaration) {
      const cls = current.asKind(SyntaxKind.ClassDeclaration)!;
      return cls.getName();
    }
    current = current.getParent();
  }

  return undefined;
}

export function extractClassContext(
  sourceFile: SourceFile,
  className: string
): ClassContext | undefined {
  const cls = sourceFile
    .getClasses()
    .find((c) => c.getName() === className);
  if (!cls) return undefined;

  const propertyTypes: Record<string, string> = {};
  const resolvedAssignments: Record<string, string> = {};

  // 1. Constructor params with access modifiers (e.g. private service: AccountService)
  const ctor = cls.getConstructors()[0];
  if (ctor) {
    for (const param of ctor.getParameters()) {
      if (param.getScope() && param.getTypeNode()) {
        propertyTypes[param.getName()] = param.getTypeNode()!.getText();
      }
    }
  }

  // 2. Property declarations (overrides constructor params)
  for (const prop of cls.getProperties()) {
    const typeNode = prop.getTypeNode();
    if (typeNode) {
      propertyTypes[prop.getName()] = typeNode.getText();
    }
  }

  // 3. Extends clause type arguments (fallback for inherited properties)
  const extendsExpr = cls.getExtends();
  if (extendsExpr) {
    const typeArgs = extendsExpr.getTypeArguments();
    for (const typeArg of typeArgs) {
      const typeName = typeArg.getText();
      if (typeName.endsWith("Service") && !propertyTypes["service"]) {
        propertyTypes["service"] = typeName;
      } else if (typeName.endsWith("Mapper") && !propertyTypes["mapper"]) {
        propertyTypes["mapper"] = typeName;
      }
    }
  }

  // 4. Constructor assignments: this.{propName} = value
  if (ctor) {
    scanBodyForAssignments(ctor.getBody(), resolvedAssignments);
  }

  // 5. Method + arrow function property assignments (bindRoute pattern)
  for (const method of cls.getMethods()) {
    scanBodyForAssignments(method.getBody(), resolvedAssignments);
  }
  for (const prop of cls.getProperties()) {
    const init = prop.getInitializer();
    if (init?.getKind() === SyntaxKind.ArrowFunction) {
      scanBodyForAssignments(
        init.asKind(SyntaxKind.ArrowFunction)!.getBody(),
        resolvedAssignments
      );
    }
  }

  return { propertyTypes, resolvedAssignments };
}

function scanBodyForAssignments(
  body: Node | undefined,
  resolvedAssignments: Record<string, string>
): void {
  if (!body) return;
  const expressions = body.getDescendantsOfKind(SyntaxKind.BinaryExpression);
  for (const expr of expressions) {
    if (expr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
    const left = expr.getLeft();
    if (left.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const propAccess = left.asKind(SyntaxKind.PropertyAccessExpression)!;
    if (propAccess.getExpression().getKind() !== SyntaxKind.ThisKeyword) continue;
    const propName = propAccess.getName();
    const resolved = resolveStaticValue(expr.getRight());
    if (resolved !== undefined) {
      resolvedAssignments[propName] = resolved;
    }
  }
}

function resolveStaticValue(node: Node): string | undefined {
  const kind = node.getKind();

  if (kind === SyntaxKind.StringLiteral) {
    return node.asKind(SyntaxKind.StringLiteral)!.getLiteralValue();
  }

  if (kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return node
      .asKind(SyntaxKind.NoSubstitutionTemplateLiteral)!
      .getLiteralValue();
  }

  if (kind === SyntaxKind.TemplateExpression) {
    return resolveTemplateExpression(node);
  }

  return undefined;
}

/**
 * Resolve a template expression like `/${Account.name.toLowerCase()}`
 * Only handles the pattern: Identifier.name.toLowerCase()
 */
function resolveTemplateExpression(node: Node): string | undefined {
  const templateExpr = node.asKind(SyntaxKind.TemplateExpression)!;
  const headText = templateExpr.getHead().getText();
  // TemplateHead text: `...${  → strip leading ` and trailing ${
  const head = headText.slice(1, -2);

  let result = head;

  for (const span of templateExpr.getTemplateSpans()) {
    const expr = span.getExpression();
    const resolved = resolveSpanExpression(expr);
    if (resolved === undefined) return undefined;

    const litText = span.getLiteral().getText();
    // TemplateMiddle: }...${  → strip leading } and trailing ${
    // TemplateTail:   }...`   → strip leading } and trailing `
    const literal = litText.slice(1, -1);
    result += resolved + literal;
  }

  return result;
}

/**
 * Resolve a span expression. Supports:
 * - Identifier.name.toLowerCase() → identifier text lowercased
 */
function resolveSpanExpression(node: Node): string | undefined {
  // Pattern: Something.name.toLowerCase()
  if (node.getKind() === SyntaxKind.CallExpression) {
    const call = node.asKind(SyntaxKind.CallExpression)!;
    const callExpr = call.getExpression();

    if (callExpr.getKind() !== SyntaxKind.PropertyAccessExpression)
      return undefined;

    const outer = callExpr.asKind(SyntaxKind.PropertyAccessExpression)!;
    const methodName = outer.getName();

    if (methodName === "toLowerCase") {
      const middle = outer.getExpression();
      // Could be Identifier.name or just Identifier
      if (middle.getKind() === SyntaxKind.PropertyAccessExpression) {
        const inner = middle.asKind(SyntaxKind.PropertyAccessExpression)!;
        if (inner.getName() === "name") {
          const identExpr = inner.getExpression();
          if (identExpr.getKind() === SyntaxKind.Identifier) {
            return identExpr.getText().toLowerCase();
          }
        }
      }
    }
  }

  return undefined;
}
