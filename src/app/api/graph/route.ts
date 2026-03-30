import { NextResponse } from "next/server";
import { createGraph, listGraphs, getGraph } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name } = body as { name?: string };
    const id = randomUUID();
    createGraph(id, name ?? "Untitled");
    return NextResponse.json({ id, name: name ?? "Untitled" }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const graph = getGraph(id);
      if (!graph) {
        return NextResponse.json({ error: "Graph not found" }, { status: 404 });
      }
      return NextResponse.json(graph);
    }

    return NextResponse.json(listGraphs());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
