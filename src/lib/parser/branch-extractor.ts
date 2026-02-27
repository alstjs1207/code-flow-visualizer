import {
  Node,
  SyntaxKind,
  IfStatement,
  ThrowStatement,
  ReturnStatement,
  SwitchStatement,
  CaseClause,
  DefaultClause,
  Block,
  type ArrowFunction,
  type FunctionDeclaration,
  type MethodDeclaration,
} from "ts-morph";
import type { FlowNode, FlowEdge, Layer, EdgeType, SourceLocation } from "@/types";

export interface BranchFragment {
  nodes: FlowNode[];
  edges: FlowEdge[];
  entryNodeId: string;
  exitNodeIds: string[];
  terminalNodeIds: string[];
  /** Exit node IDs that represent a "false" continuation from a guard clause */
  falseExitIds?: Set<string>;
}

type FunctionLike = FunctionDeclaration | MethodDeclaration | ArrowFunction;

let nodeCounter = 0;

export function resetNodeCounter(): void {
  nodeCounter = 0;
}

function nextId(prefix: string): string {
  nodeCounter++;
  return `${prefix}${nodeCounter}`;
}

function getSourceLocation(node: Node): SourceLocation {
  const sourceFile = node.getSourceFile();
  return {
    file: sourceFile.getBaseName(),
    line: node.getStartLineNumber(),
    column: node.getStart() - node.getStartLinePos(),
    endLine: node.getEndLineNumber(),
  };
}

export function extractBranches(
  fn: FunctionLike,
  layer: Layer,
  prefix: string
): BranchFragment {
  const body = fn.getBody();
  if (!body || body.getKind() !== SyntaxKind.Block) {
    const id = nextId(prefix);
    const node: FlowNode = {
      id,
      type: "action",
      layer,
      label: (fn as any).getName?.() || "anonymous",
      source: getSourceLocation(fn),
    };
    return {
      nodes: [node],
      edges: [],
      entryNodeId: id,
      exitNodeIds: [id],
      terminalNodeIds: [],
    };
  }

  const block = body as Block;
  const statements = block.getStatements();

  return processStatements(statements, layer, prefix);
}

function processStatements(
  statements: Node[],
  layer: Layer,
  prefix: string
): BranchFragment {
  const allNodes: FlowNode[] = [];
  const allEdges: FlowEdge[] = [];
  let currentExitIds: string[] = [];
  let currentFalseExitIds = new Set<string>();
  let entryNodeId = "";
  const terminalNodeIds: string[] = [];

  for (const stmt of statements) {
    const fragment = processStatement(stmt, layer, prefix);
    if (!fragment) continue;

    allNodes.push(...fragment.nodes);
    allEdges.push(...fragment.edges);

    if (!entryNodeId) {
      entryNodeId = fragment.entryNodeId;
    }

    // Connect previous exit nodes to this fragment's entry
    for (const exitId of currentExitIds) {
      const isFalseExit = currentFalseExitIds.has(exitId);
      allEdges.push({
        from: exitId,
        to: fragment.entryNodeId,
        ...(isFalseExit ? { label: "No", type: "false" as EdgeType } : {}),
      });
    }

    // Update current exit nodes
    currentExitIds = fragment.exitNodeIds;
    currentFalseExitIds = fragment.falseExitIds || new Set();
    terminalNodeIds.push(...fragment.terminalNodeIds);
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    entryNodeId,
    exitNodeIds: currentExitIds,
    terminalNodeIds,
    falseExitIds: currentFalseExitIds,
  };
}

function processStatement(
  stmt: Node,
  layer: Layer,
  prefix: string
): BranchFragment | null {
  const kind = stmt.getKind();

  switch (kind) {
    case SyntaxKind.IfStatement:
      return processIfStatement(stmt as IfStatement, layer, prefix);

    case SyntaxKind.ThrowStatement:
      return processThrowStatement(stmt as ThrowStatement, layer, prefix);

    case SyntaxKind.SwitchStatement:
      return processSwitchStatement(stmt as SwitchStatement, layer, prefix);

    case SyntaxKind.ReturnStatement:
      return processReturnStatement(stmt as ReturnStatement, layer, prefix);

    case SyntaxKind.ExpressionStatement:
    case SyntaxKind.VariableStatement:
      return processActionStatement(stmt, layer, prefix);

    default:
      return null;
  }
}

function processIfStatement(
  stmt: IfStatement,
  layer: Layer,
  prefix: string
): BranchFragment {
  const conditionText = stmt.getExpression().getText();
  const condId = nextId(prefix);

  const condNode: FlowNode = {
    id: condId,
    type: "condition",
    layer,
    label: conditionText,
    rawCode: stmt.getExpression().getText(),
    source: getSourceLocation(stmt),
  };

  const nodes: FlowNode[] = [condNode];
  const edges: FlowEdge[] = [];
  const exitNodeIds: string[] = [];
  const terminalNodeIds: string[] = [];

  // Process "then" branch
  const thenBlock = stmt.getThenStatement();
  const thenStatements = getBlockStatements(thenBlock);
  const thenFragment = processStatements(thenStatements, layer, prefix);

  if (thenFragment.nodes.length > 0) {
    nodes.push(...thenFragment.nodes);
    edges.push(...thenFragment.edges);
    edges.push({
      from: condId,
      to: thenFragment.entryNodeId,
      label: "Yes",
      type: "true",
    });

    // Check if then branch terminates (throw/return)
    const thenTerminates = thenFragment.terminalNodeIds.length > 0 &&
      thenFragment.exitNodeIds.length === 0;
    if (thenTerminates) {
      terminalNodeIds.push(...thenFragment.terminalNodeIds);
    } else {
      exitNodeIds.push(...thenFragment.exitNodeIds);
      terminalNodeIds.push(...thenFragment.terminalNodeIds);
    }
  }

  // Process "else" branch
  const elseStmt = stmt.getElseStatement();
  if (elseStmt) {
    const elseStatements = getBlockStatements(elseStmt);
    const elseFragment = processStatements(elseStatements, layer, prefix);

    if (elseFragment.nodes.length > 0) {
      nodes.push(...elseFragment.nodes);
      edges.push(...elseFragment.edges);
      edges.push({
        from: condId,
        to: elseFragment.entryNodeId,
        label: "No",
        type: "false",
      });
      exitNodeIds.push(...elseFragment.exitNodeIds);
      terminalNodeIds.push(...elseFragment.terminalNodeIds);
    }
  } else {
    // No else branch — condition's "No" path continues to next statement
    exitNodeIds.push(condId);
  }

  // Track which exits are "false" continuations from guard clauses
  const falseExitIds = new Set<string>();
  const thenTerminates = thenFragment.terminalNodeIds.length > 0 &&
    thenFragment.exitNodeIds.length === 0;
  if (!elseStmt && thenTerminates) {
    // Guard clause: if (cond) { throw/return } — continuation is "No" path
    falseExitIds.add(condId);
  }

  return {
    nodes,
    edges,
    entryNodeId: condId,
    exitNodeIds,
    terminalNodeIds,
    falseExitIds,
  };
}

function processSwitchStatement(
  stmt: SwitchStatement,
  layer: Layer,
  prefix: string
): BranchFragment {
  const conditionText = `switch(${stmt.getExpression().getText()})`;
  const condId = nextId(prefix);

  const condNode: FlowNode = {
    id: condId,
    type: "condition",
    layer,
    label: conditionText,
    rawCode: stmt.getExpression().getText(),
    source: getSourceLocation(stmt),
  };

  const nodes: FlowNode[] = [condNode];
  const edges: FlowEdge[] = [];
  const exitNodeIds: string[] = [];
  const terminalNodeIds: string[] = [];
  let hasDefault = false;

  for (const clause of stmt.getClauses()) {
    let edgeLabel: string;
    let clauseStatements: Node[];

    if (clause instanceof CaseClause) {
      edgeLabel = `case ${clause.getExpression().getText()}`;
      clauseStatements = clause.getStatements().filter(
        (s) => s.getKind() !== SyntaxKind.BreakStatement
      );
    } else {
      // DefaultClause
      edgeLabel = "default";
      hasDefault = true;
      clauseStatements = (clause as DefaultClause).getStatements().filter(
        (s) => s.getKind() !== SyntaxKind.BreakStatement
      );
    }

    if (clauseStatements.length === 0) continue;

    const fragment = processStatements(clauseStatements, layer, prefix);
    if (fragment.nodes.length === 0) continue;

    nodes.push(...fragment.nodes);
    edges.push(...fragment.edges);
    edges.push({
      from: condId,
      to: fragment.entryNodeId,
      label: edgeLabel,
    });

    exitNodeIds.push(...fragment.exitNodeIds);
    terminalNodeIds.push(...fragment.terminalNodeIds);
  }

  // If no default clause, the switch condition itself is an exit
  // (control can fall through without matching any case)
  if (!hasDefault) {
    exitNodeIds.push(condId);
  }

  return {
    nodes,
    edges,
    entryNodeId: condId,
    exitNodeIds,
    terminalNodeIds,
  };
}

function processThrowStatement(
  stmt: ThrowStatement,
  layer: Layer,
  prefix: string
): BranchFragment {
  const id = nextId(prefix);
  const expression = stmt.getExpression();
  let label = "throw";

  if (expression) {
    const text = expression.getText();
    // Extract error message from `new SomeError("message")`
    const msgMatch = text.match(
      /new\s+\w+\s*\(\s*["'`]([^"'`]+)["'`]/
    );
    if (msgMatch) {
      label = `throw: ${msgMatch[1]}`;
    } else {
      label = `throw ${text.split("(")[0].replace("new ", "").trim()}`;
    }
  }

  const node: FlowNode = {
    id,
    type: "error",
    layer,
    label,
    rawCode: stmt.getText(),
    source: getSourceLocation(stmt),
  };

  return {
    nodes: [node],
    edges: [],
    entryNodeId: id,
    exitNodeIds: [],
    terminalNodeIds: [id],
  };
}

function processReturnStatement(
  stmt: ReturnStatement,
  layer: Layer,
  prefix: string
): BranchFragment {
  const id = nextId(prefix);
  const expression = stmt.getExpression();
  let label = "return";

  if (expression) {
    const text = expression.getText();
    // Try to extract status code from `res.status(201).json(...)`
    const statusMatch = text.match(/\.status\((\d+)\)/);
    if (statusMatch) {
      const code = parseInt(statusMatch[1]);
      const statusText = getStatusText(code);
      label = `${code} ${statusText}`;
    } else if (text.length <= 40) {
      label = `return ${text}`;
    } else {
      label = "return ...";
    }
  }

  const node: FlowNode = {
    id,
    type: "return",
    layer,
    label,
    rawCode: stmt.getText(),
    source: getSourceLocation(stmt),
  };

  return {
    nodes: [node],
    edges: [],
    entryNodeId: id,
    exitNodeIds: [],
    terminalNodeIds: [id],
  };
}

function processActionStatement(
  stmt: Node,
  layer: Layer,
  prefix: string
): BranchFragment {
  const id = nextId(prefix);
  const text = stmt.getText();

  let label = text;
  if (text.length > 60) {
    // Summarize long statements
    const callMatch = text.match(
      /(?:await\s+)?(?:(?:const|let|var)\s+\w+\s*=\s*)?(?:await\s+)?(\w+(?:\.\w+)*)\s*\(/
    );
    if (callMatch) {
      label = `${callMatch[1].replace(/^this\./, "")}()`;
    } else {
      label = text.slice(0, 50) + "...";
    }
  }

  // Clean up label
  label = label.replace(/;$/, "").replace(/^this\./, "").trim();

  const node: FlowNode = {
    id,
    type: "action",
    layer,
    label,
    rawCode: text,
    source: getSourceLocation(stmt),
  };

  return {
    nodes: [node],
    edges: [],
    entryNodeId: id,
    exitNodeIds: [id],
    terminalNodeIds: [],
  };
}

function getBlockStatements(node: Node): Node[] {
  if (node.getKind() === SyntaxKind.Block) {
    return (node as Block).getStatements();
  }
  return [node];
}

function getStatusText(code: number): string {
  const statusTexts: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    500: "Internal Server Error",
  };
  return statusTexts[code] || "";
}
