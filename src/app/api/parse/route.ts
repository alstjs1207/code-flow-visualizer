import { NextRequest, NextResponse } from "next/server";
import { CodeFlowParser } from "@/lib/parser";

export async function POST(req: NextRequest) {
  try {
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

    return NextResponse.json({ handlers });
  } catch (err) {
    console.error("[POST /api/parse]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parse failed" },
      { status: 500 }
    );
  }
}
