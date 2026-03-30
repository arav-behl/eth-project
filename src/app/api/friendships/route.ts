import { NextResponse } from "next/server";
import { getFriendships, addFriendship, deleteFriendship } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ens = searchParams.get("ens") || undefined;

  try {
    const friendships = getFriendships(ens);
    return NextResponse.json({ friendships });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ens_a, ens_b, address_a, address_b } = body;

    if (!ens_a || !ens_b) {
      return NextResponse.json({ error: "Both ens_a and ens_b are required" }, { status: 400 });
    }

    const friendship = addFriendship(ens_a, ens_b, address_a, address_b);

    if (!friendship) {
      return NextResponse.json({ error: "Friendship already exists" }, { status: 409 });
    }

    return NextResponse.json(friendship, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { ens_a, ens_b } = body;

    if (!ens_a || !ens_b) {
      return NextResponse.json({ error: "Both ens_a and ens_b are required" }, { status: 400 });
    }

    const deleted = deleteFriendship(ens_a, ens_b);

    if (!deleted) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
