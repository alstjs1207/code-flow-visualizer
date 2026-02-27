import { Project } from "ts-morph";
import type { FlowGraph, HandlerEntry } from "@/types";
import { scanHandlersFromSourceFile } from "./handler-scanner";
import { buildFlowGraph } from "./flow-graph-builder";

export class CodeFlowParser {
  private project: Project;

  constructor(files: Map<string, string>) {
    this.project = new Project({ useInMemoryFileSystem: true });
    for (const [path, content] of files) {
      this.project.createSourceFile(path, content);
    }
  }

  scanHandlers(): HandlerEntry[] {
    const handlers: HandlerEntry[] = [];

    for (const sourceFile of this.project.getSourceFiles()) {
      const fileHandlers = scanHandlersFromSourceFile(sourceFile);
      handlers.push(...fileHandlers);
    }

    return handlers;
  }

  buildFlowGraph(handlerEntry: HandlerEntry, debug?: Record<string, unknown>): FlowGraph {
    return buildFlowGraph(this.project, handlerEntry, debug);
  }
}
