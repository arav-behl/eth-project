import { NextResponse } from "next/server";
import { getGraph, addNode, removeNode, addEdge, removeEdge, deleteGraph } from "@/lib/db";
import type { GraphNodeData, GraphEdgeData } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  try {
    const graph = getGraph(id);
    if (!graph) {
      return NextResponse.json({ error: "Graph not found" }, { status: 404 });
    }
    return NextResponse.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface PutBody {
  action: "addNode" | "removeNode" | "addEdge" | "removeEdge";
  node?: GraphNodeData;
  edge?: GraphEdgeData;
  ensName?: string;
  sourceEns?: string;
  targetEns?: string;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  try {
    const graph = getGraph(id);
    if (!graph) {
      return NextResponse.json({ error: "Graph not found" }, { status: 404 });
    }

    const body = (await request.json()) as PutBody;

    switch (body.action) {
      case "addNode":
        if (!body.node) return NextResponse.json({ error: "Missing node data" }, { status: 400 });
        addNode(id, body.node);
        break;
      case "removeNode":
        if (!body.ensName) return NextResponse.json({ error: "Missing ensName" }, { status: 400 });
        removeNode(id, body.ensName);
        break;
      case "addEdge":
        if (!body.edge) return NextResponse.json({ error: "Missing edge data" }, { status: 400 });
        addEdge(id, body.edge);
        break;
      case "removeEdge":
        if (!body.sourceEns || !body.targetEns)
          return NextResponse.json({ error: "Missing edge endpoints" }, { status: 400 });
        removeEdge(id, body.sourceEns, body.targetEns);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  try {
    deleteGraph(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
