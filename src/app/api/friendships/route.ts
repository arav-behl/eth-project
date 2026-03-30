import { NextResponse } from "next/server";
import os from "os";
import path from "path";
import { promises as fs } from "fs";

interface FriendshipRecord {
  id: number;
  ens_a: string;
  ens_b: string;
  address_a: string | null;
  address_b: string | null;
  created_at: string;
}

const DATA_FILE = path.join(os.tmpdir(), "ens-explorer-friendships.json");

function normalizeEns(value: string): string {
  return value.trim().toLowerCase();
}

function sortPair(ensA: string, ensB: string): [string, string] {
  return ensA < ensB ? [ensA, ensB] : [ensB, ensA];
}

async function readFriendships(): Promise<FriendshipRecord[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FriendshipRecord[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeFriendships(friendships: FriendshipRecord[]): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(friendships, null, 2), "utf8");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ens = searchParams.get("ens") || undefined;

  try {
    const friendships = await readFriendships();
    const filtered = ens
      ? friendships.filter((friendship) => friendship.ens_a === ens || friendship.ens_b === ens)
      : friendships;
    return NextResponse.json({ friendships: filtered });
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

    const normalizedA = normalizeEns(ens_a);
    const normalizedB = normalizeEns(ens_b);
    if (normalizedA === normalizedB) {
      return NextResponse.json({ error: "Cannot create a self friendship" }, { status: 400 });
    }

    const [low, high] = sortPair(normalizedA, normalizedB);
    const friendships = await readFriendships();
    const exists = friendships.some((friendship) => friendship.ens_a === low && friendship.ens_b === high);

    if (exists) {
      return NextResponse.json({ error: "Friendship already exists" }, { status: 409 });
    }

    const friendship: FriendshipRecord = {
      id: Date.now(),
      ens_a: low,
      ens_b: high,
      address_a: low === normalizedA ? address_a ?? null : address_b ?? null,
      address_b: high === normalizedB ? address_b ?? null : address_a ?? null,
      created_at: new Date().toISOString(),
    };

    await writeFriendships([friendship, ...friendships]);
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

    const [low, high] = sortPair(normalizeEns(ens_a), normalizeEns(ens_b));
    const friendships = await readFriendships();
    const nextFriendships = friendships.filter(
      (friendship) => !(friendship.ens_a === low && friendship.ens_b === high)
    );
    const deleted = nextFriendships.length !== friendships.length;

    if (!deleted) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }

    await writeFriendships(nextFriendships);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
