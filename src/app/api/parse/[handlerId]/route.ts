import { NextRequest, NextResponse } from "next/server";
import { CodeFlowParser } from "@/lib/parser";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handlerId: string }> }
) {
  try {
    const { handlerId } = await params;
    const { handlerCode, serviceCode } = await req.json();

    if (!handlerCode) {
      return NextResponse.json(
        { error: "handlerCode is required" },
        { status: 400 }
      );
    }

    const files = new Map<string, string>();
    files.set("handler.ts", handlerCode);
    if (serviceCode) {
      files.set("service.ts", serviceCode);
    }

    const parser = new CodeFlowParser(files);
    const handlers = parser.scanHandlers();

    const handler = handlers.find((h) => h.id === handlerId);
    if (!handler) {
      return NextResponse.json(
        { error: `Handler not found: ${handlerId}` },
        { status: 404 }
      );
    }

    const flowGraph = parser.buildFlowGraph(handler);

    return NextResponse.json(flowGraph);
  } catch (err) {
    console.error("[POST /api/parse/[handlerId]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Build FlowGraph failed" },
      { status: 500 }
    );
  }
}
