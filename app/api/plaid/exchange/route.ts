import { NextResponse } from "next/server";
import { saveConnection } from "@/lib/connection-store";
import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured on the server." }, { status: 503 });
  }

  try {
    const body = await request.json();
    if (typeof body.publicToken !== "string" || body.publicToken.length === 0) {
      return NextResponse.json({ error: "A Plaid public token is required." }, { status: 400 });
    }

    const { data } = await getPlaidClient().itemPublicTokenExchange({ public_token: body.publicToken });
    const institutionName =
      typeof body.institution?.name === "string" && body.institution.name.trim()
        ? body.institution.name.trim()
        : "Connected institution";
    saveConnection(data.item_id, institutionName, data.access_token);
    return NextResponse.json({ connected: true });
  } catch (error) {
    console.error("Plaid token exchange failed", error);
    return NextResponse.json({ error: "Could not finish connecting this bank. Check your credentials and encryption key." }, { status: 502 });
  }
}