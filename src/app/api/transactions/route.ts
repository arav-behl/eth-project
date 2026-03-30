import { NextResponse } from "next/server";
import { getRelationship } from "@/lib/etherscan";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const addressA = searchParams.get("a");
  const addressB = searchParams.get("b");

  if (!addressA || !addressB) {
    return NextResponse.json(
      { error: "Both 'a' and 'b' address parameters are required" },
      { status: 400 }
    );
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(addressA) || !/^0x[a-fA-F0-9]{40}$/.test(addressB)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address format" },
      { status: 400 }
    );
  }

  try {
    const summary = await getRelationship(addressA, addressB);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
