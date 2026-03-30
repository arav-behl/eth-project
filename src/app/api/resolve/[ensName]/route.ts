import { NextResponse } from "next/server";
import { resolveENS } from "@/lib/ens";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ensName: string }> }
): Promise<NextResponse> {
  const { ensName } = await context.params;

  if (!ensName.endsWith(".eth")) {
    return NextResponse.json(
      { error: "Invalid ENS name. Must end with .eth" },
      { status: 400 }
    );
  }

  try {
    const profile = await resolveENS(ensName);

    if (!profile.address) {
      return NextResponse.json(
        { error: `ENS name "${ensName}" not found or has no address set` },
        { status: 404 }
      );
    }

    return NextResponse.json(profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to resolve ENS: ${message}` },
      { status: 500 }
    );
  }
}
