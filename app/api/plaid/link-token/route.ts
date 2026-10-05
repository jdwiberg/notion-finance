import { CountryCode, Products } from "plaid";
import { NextResponse } from "next/server";
import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";

export const runtime = "nodejs";

export async function POST() {
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: "Add your Plaid Sandbox credentials to .env.local to connect a bank." }, { status: 503 });
  }

  try {
    const { data } = await getPlaidClient().linkTokenCreate({
      user: { client_user_id: "local-user" },
      client_name: "Ledger Personal Finance",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return NextResponse.json({ linkToken: data.link_token });
  } catch (error) {
    console.error("Plaid link token creation failed", error);
    return NextResponse.json({ error: "Plaid could not start a connection. Check your environment and credentials." }, { status: 502 });
  }
}