import { Project, SourceFile, SyntaxKind, Node } from "ts-morph";
import type { FlowGraph, FlowNode, FlowEdge, Layer } from "@/types";
import type { HandlerEntry } from "@/types";
import { extractBranches, resetNodeCounter } from "./branch-extractor";
import { traceServiceCalls } from "./call-tracer";

export function buildFlowGraph(
  project: Project,
  entry: HandlerEntry,
  debug?: Record<string, unknown>
): FlowGraph {
  resetNodeCounter();
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  // 1. Create entry node
  const entryNode: FlowNode = {
    id: "h1",
    type: "entry",
    layer: "handler",
    label: `${entry.method} ${entry.path}`,
  };
  nodes.push(entryNode);

  // 2. Find the handler function
  const sourceFile = findSourceFile(project, entry.file);
  if (!sourceFile) {
    return { handler: entry.functionName, method: entry.method, path: entry.path, file: entry.file, nodes, edges };
  }

  let handlerFn: Node | undefined = sourceFile.getFunction(entry.functionName) ?? undefined;
  if (!handlerFn) {
    // Fastify: this.server.{method}(path, ..., handler) — find inline arrow handler
    handlerFn = findFastifyInlineHandler(sourceFile, entry);
  }
  if (!handlerFn) {
    return { handler: entry.functionName, method: entry.method, path: entry.path, file: entry.file, nodes, edges };
  }

  // 3. Extract branches from handler
  const handlerFragment = extractBranches(handlerFn as any, "handler", "h");

  // Re-number handler nodes to start after entry node
  const handlerNodes = handlerFragment.nodes.map((n) => ({
    ...n,
    id: `h${parseInt(n.id.slice(1)) + 1}`,
  }));
  const handlerEdges = handlerFragment.edges.map((e) => ({
    ...e,
    from: `h${parseInt(e.from.slice(1)) + 1}`,
    to: `h${parseInt(e.to.slice(1)) + 1}`,
  }));

  nodes.push(...handlerNodes);
  edges.push(...handlerEdges);

  // Connect entry to handler's first node
  if (handlerFragment.entryNodeId) {
    const remappedEntryId = `h${parseInt(handlerFragment.entryNodeId.slice(1)) + 1}`;
    edges.push({ from: "h1", to: remappedEntryId });
  }

  // 4. Find service calls and expand them
  const serviceCalls = traceServiceCalls(handlerFn as any);
  const serviceClasses = findServiceClasses(project);

  // Diagnostics: discovered service classes
  if (debug) {
    debug.serviceClassesFound = Object.fromEntries(
      Array.from(serviceClasses.entries()).map(([k, v]) => [k, v.file])
    );
    debug.serviceCallsFound = serviceCalls.map((c) => ({
      objectName: c.objectName,
      methodName: c.methodName,
      layer: c.layer,
      isInternalCall: c.isInternalCall,
    }));
    debug.serviceCallMatching = [];
  }

  for (const call of serviceCalls) {
    let resolvedObjectName = call.objectName;
    if (entry.serviceTypeMap?.[call.objectName]) {
      resolvedObjectName = entry.serviceTypeMap[call.objectName];
    }

    const serviceClass = serviceClasses.get(resolvedObjectName);

    // Diagnostics: per-call matching result
    if (debug) {
      const callDebug: Record<string, unknown> = {
        objectName: call.objectName,
        methodName: call.methodName,
        resolvedName: resolvedObjectName,
        classFound: serviceClasses.has(resolvedObjectName),
        availableClasses: Array.from(serviceClasses.keys()),
      };
      if (serviceClass) {
        callDebug.methodFound = !!serviceClass.cls.getMethod(call.methodName);
        callDebug.actionNodeFound = !!findActionNodeForCall(
          handlerNodes,
          resolvedObjectName,
          call.methodName,
          resolvedObjectName !== call.objectName ? call.objectName : undefined
        );
      }
      (debug.serviceCallMatching as unknown[]).push(callDebug);
    }

    if (!serviceClass) continue;

    const method = serviceClass.cls.getMethod(call.methodName);
    if (!method) continue;

    // Find the handler action node that references this service call
    const actionNode = findActionNodeForCall(
      handlerNodes,
      resolvedObjectName,
      call.methodName,
      resolvedObjectName !== call.objectName ? call.objectName : undefined
    );

    if (!actionNode) continue;

    // Extract branches from service method
    const serviceFragment = extractBranches(method, "service", "s");
    const serviceNodes = serviceFragment.nodes;
    const serviceEdges = serviceFragment.edges;

    // Trace calls within the service method
    const allCalls = traceServiceCalls(method);
    const daoCalls = allCalls.filter((c) => !c.isInternalCall && c.layer === "dao");
    const internalCalls = allCalls.filter((c) => c.isInternalCall === true);

    // Create DAO action nodes
    const daoNodes: FlowNode[] = [];
    for (const daoCall of daoCalls) {
      const daoNodeId = `d${daoNodes.length + 1 + nodes.filter((n) => n.layer === "dao").length}`;
      daoNodes.push({
        id: daoNodeId,
        type: "action",
        layer: "dao",
        label: `${daoCall.objectName}.${daoCall.methodName}()`,
        source: {
          file: serviceClass.file,
          line: daoCall.line,
          column: daoCall.column,
        },
      });
    }

    // Replace the handler action node with the expanded service flow
    // Remove the action node from handler nodes
    const actionIdx = nodes.findIndex((n) => n.id === actionNode.id);
    if (actionIdx !== -1) {
      nodes.splice(actionIdx, 1);
    }

    // Replace edges pointing to the action node
    const incomingEdges = edges.filter((e) => e.to === actionNode.id);
    const outgoingEdges = edges.filter((e) => e.from === actionNode.id);

    // Remove old edges
    for (let i = edges.length - 1; i >= 0; i--) {
      if (edges[i].to === actionNode.id || edges[i].from === actionNode.id) {
        edges.splice(i, 1);
      }
    }

    // Add service nodes and edges
    nodes.push(...serviceNodes);
    edges.push(...serviceEdges);
    nodes.push(...daoNodes);

    // Connect incoming edges to service entry
    if (serviceFragment.entryNodeId) {
      for (const inEdge of incomingEdges) {
        edges.push({ ...inEdge, to: serviceFragment.entryNodeId });
      }
    }

    // Connect service exit to the next nodes
    // Include return-type terminal nodes as exits (service return = value back to handler, not flow termination)
    // Exclude error-type (throw) nodes — those are true terminations
    const serviceExits = [
      ...serviceFragment.exitNodeIds,
      ...serviceFragment.terminalNodeIds.filter((id) => {
        const n = serviceNodes.find((node) => node.id === id);
        return n?.type === "return";
      }),
    ];
    for (const exitId of serviceExits) {
      for (const outEdge of outgoingEdges) {
        edges.push({ ...outEdge, from: exitId });
      }
    }

    // Integrate DAO nodes into the service flow
    integrateDAONodes(serviceNodes, serviceEdges, daoNodes, daoCalls, edges, nodes);

    // Expand internal method calls (this.method())
    if (internalCalls.length > 0) {
      expandInternalCalls(
        internalCalls,
        serviceClass,
        serviceNodes,
        nodes,
        edges,
        1
      );
    }
  }

  return {
    handler: entry.functionName,
    method: entry.method,
    path: entry.path,
    file: entry.file,
    nodes,
    edges,
  };
}

const FASTIFY_SERVER_NAMES = new Set(["server", "app", "fastify"]);
const FASTIFY_HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

function findFastifyInlineHandler(
  sourceFile: SourceFile,
  entry: HandlerEntry
): Node | undefined {
  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  );

  for (const call of callExpressions) {
    const expression = call.getExpression();
    if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const outer = expression.asKind(SyntaxKind.PropertyAccessExpression)!;
    const httpMethod = outer.getName().toLowerCase();
    if (!FASTIFY_HTTP_METHODS.has(httpMethod)) continue;

    const middle = outer.getExpression();
    if (middle.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const inner = middle.asKind(SyntaxKind.PropertyAccessExpression)!;
    const serverName = inner.getName().toLowerCase();
    if (!FASTIFY_SERVER_NAMES.has(serverName)) continue;

    const thisExpr = inner.getExpression();
    if (thisExpr.getKind() !== SyntaxKind.ThisKeyword) continue;

    // Match by HTTP method and path
    if (httpMethod.toUpperCase() !== entry.method) continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    const pathArg = args[0];
    let path = "/";
    if (pathArg.getKind() === SyntaxKind.StringLiteral) {
      path = pathArg.asKind(SyntaxKind.StringLiteral)!.getLiteralValue();
    } else if (pathArg.getKind() === SyntaxKind.TemplateExpression) {
      path = pathArg.getText().slice(1, -1);
    } else if (pathArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
      path = pathArg.asKind(SyntaxKind.NoSubstitutionTemplateLiteral)!.getLiteralValue();
    }

    if (path !== entry.path && path !== entry.rawPath) continue;

    // Return the last ArrowFunction argument
    for (let i = args.length - 1; i >= 0; i--) {
      if (args[i].getKind() === SyntaxKind.ArrowFunction) {
        return args[i];
      }
    }
  }

  return undefined;
}

function findSourceFile(
  project: Project,
  fileName: string
): SourceFile | undefined {
  const files = project.getSourceFiles();
  return files.find(
    (f) => f.getBaseName() === fileName || f.getFilePath().endsWith(fileName)
  );
}

interface ServiceClassInfo {
  cls: ReturnType<SourceFile["getClasses"]>[0];
  file: string;
}

function findServiceClasses(
  project: Project
): Map<string, ServiceClassInfo> {
  const result = new Map<string, ServiceClassInfo>();

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName();
      if (!className) continue;

      // Map class name to instance variable name convention
      // EnrollmentService → enrollmentService
      const instanceName =
        className.charAt(0).toLowerCase() + className.slice(1);
      result.set(instanceName, {
        cls,
        file: sourceFile.getBaseName(),
      });
    }
  }

  return result;
}

function findActionNodeForCall(
  nodes: FlowNode[],
  objectName: string,
  methodName: string,
  originalObjectName?: string
): FlowNode | undefined {
  const textIncludes = (text: string | undefined, needle: string) =>
    text !== undefined && text.includes(needle);

  return nodes.find(
    (n) =>
      (n.type === "action" || n.type === "return") &&
      (textIncludes(n.label, objectName) ||
        textIncludes(n.rawCode, objectName) ||
        (originalObjectName !== undefined &&
          (textIncludes(n.label, originalObjectName) ||
            textIncludes(n.rawCode, originalObjectName)))) &&
      (textIncludes(n.label, methodName) ||
        textIncludes(n.rawCode, methodName))
  );
}

const MAX_INTERNAL_DEPTH = 3;

function expandInternalCalls(
  internalCalls: ReturnType<typeof traceServiceCalls>,
  serviceClass: ServiceClassInfo,
  serviceNodes: FlowNode[],
  allNodes: FlowNode[],
  allEdges: FlowEdge[],
  depth: number
): void {
  if (depth > MAX_INTERNAL_DEPTH) return;

  for (const call of internalCalls) {
    const methodName = call.methodName;
    const internalMethod = serviceClass.cls.getMethod(methodName);
    if (!internalMethod) continue;

    // Find the service node that references this.methodName()
    const targetNode = serviceNodes.find(
      (n) =>
        (n.type === "action" || n.type === "return") &&
        n.rawCode &&
        n.rawCode.includes(`this.${methodName}`)
    );
    if (!targetNode) continue;

    // Extract branches from the internal method
    const fragment = extractBranches(internalMethod, "service", "s");
    const newNodes = fragment.nodes;
    const newEdges = fragment.edges;

    // Remove target node from allNodes
    const targetIdx = allNodes.indexOf(targetNode);
    if (targetIdx !== -1) {
      allNodes.splice(targetIdx, 1);
    }
    // Also remove from serviceNodes tracking
    const sIdx = serviceNodes.indexOf(targetNode);
    if (sIdx !== -1) {
      serviceNodes.splice(sIdx, 1);
    }

    // Rewire edges
    const incomingEdges = allEdges.filter((e) => e.to === targetNode.id);
    const outgoingEdges = allEdges.filter((e) => e.from === targetNode.id);

    for (let i = allEdges.length - 1; i >= 0; i--) {
      if (allEdges[i].to === targetNode.id || allEdges[i].from === targetNode.id) {
        allEdges.splice(i, 1);
      }
    }

    allNodes.push(...newNodes);
    allEdges.push(...newEdges);
    serviceNodes.push(...newNodes);

    // Connect incoming → fragment entry
    if (fragment.entryNodeId) {
      for (const inEdge of incomingEdges) {
        allEdges.push({ ...inEdge, to: fragment.entryNodeId });
      }
    }

    // Connect fragment exits → outgoing
    // Include return-type terminal nodes as exits (same logic as buildFlowGraph)
    const exits = [
      ...fragment.exitNodeIds,
      ...fragment.terminalNodeIds.filter((id) => {
        const n = newNodes.find((node) => node.id === id);
        return n?.type === "return";
      }),
    ];
    for (const exitId of exits) {
      for (const outEdge of outgoingEdges) {
        allEdges.push({ ...outEdge, from: exitId });
      }
    }

    // Handle DAO calls within the internal method
    const innerCalls = traceServiceCalls(internalMethod);
    const innerDaoCalls = innerCalls.filter((c) => !c.isInternalCall && c.layer === "dao");
    const innerInternalCalls = innerCalls.filter((c) => c.isInternalCall === true);

    if (innerDaoCalls.length > 0) {
      const daoNodes: FlowNode[] = [];
      for (const daoCall of innerDaoCalls) {
        const daoNodeId = `d${daoNodes.length + 1 + allNodes.filter((n) => n.layer === "dao").length}`;
        daoNodes.push({
          id: daoNodeId,
          type: "action",
          layer: "dao",
          label: `${daoCall.objectName}.${daoCall.methodName}()`,
          source: {
            file: serviceClass.file,
            line: daoCall.line,
            column: daoCall.column,
          },
        });
      }

      allNodes.push(...daoNodes);
      integrateDAONodes(newNodes, newEdges, daoNodes, innerDaoCalls, allEdges, allNodes);
    }

    // Recursively expand nested internal calls
    if (innerInternalCalls.length > 0) {
      expandInternalCalls(
        innerInternalCalls,
        serviceClass,
        newNodes,
        allNodes,
        allEdges,
        depth + 1
      );
    }
  }
}

function integrateDAONodes(
  serviceNodes: FlowNode[],
  serviceEdges: FlowEdge[],
  daoNodes: FlowNode[],
  daoCalls: ReturnType<typeof traceServiceCalls>,
  allEdges: FlowEdge[],
  allNodes: FlowNode[]
): void {
  // For each DAO call, find the corresponding service action node
  // and replace it with the DAO node
  for (let i = 0; i < daoCalls.length && i < daoNodes.length; i++) {
    const daoCall = daoCalls[i];
    const daoNode = daoNodes[i];

    // Find the service action node that contains this DAO call
    const serviceActionNode = serviceNodes.find(
      (n) =>
        (n.type === "action" || n.type === "return") &&
        n.rawCode &&
        n.rawCode.includes(`${daoCall.objectName}.${daoCall.methodName}`)
    );

    if (serviceActionNode) {
      // Replace the service action node ID in all edges with the DAO node ID
      for (const edge of allEdges) {
        if (edge.from === serviceActionNode.id) {
          edge.from = daoNode.id;
        }
        if (edge.to === serviceActionNode.id) {
          edge.to = daoNode.id;
        }
      }

      // Remove the service action node from the nodes list (it's been replaced by DAO node)
      const idx = serviceNodes.indexOf(serviceActionNode);
      if (idx !== -1) {
        serviceNodes.splice(idx, 1);
      }
      // Also remove from allNodes to prevent orphan nodes
      const globalIdx = allNodes.indexOf(serviceActionNode);
      if (globalIdx !== -1) {
        allNodes.splice(globalIdx, 1);
      }
    }
  }
}
