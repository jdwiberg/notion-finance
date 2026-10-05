import { NextResponse } from "next/server";
import { getConnections } from "@/lib/connection-store";
import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";

export const runtime = "nodejs";

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: "Add your Plaid Sandbox credentials to .env.local to retrieve bank data." }, { status: 503 });
  }

  try {
    const plaid = getPlaidClient();
    const connections = await Promise.all(
      getConnections().map(async (connection) => {
        const [accountResponse, transactionResponse] = await Promise.all([
          plaid.accountsGet({ access_token: connection.accessToken }),
          plaid.transactionsGet({
            access_token: connection.accessToken,
            start_date: dateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
            end_date: dateString(new Date()),
            options: { count: 100, offset: 0 },
          }),
        ]);

        const accountDetails = new Map(accountResponse.data.accounts.map((account) => [account.account_id, {
          name: account.name,
          type: account.type,
        }]));
        return {
          institutionName: connection.institutionName,
          accounts: accountResponse.data.accounts.map((account) => ({
            id: account.account_id,
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            balance: account.balances.current,
            currency: account.balances.iso_currency_code ?? "USD",
          })),
          transactions: transactionResponse.data.transactions.map((transaction) => ({
            id: transaction.transaction_id,
            name: transaction.name,
            merchant: transaction.merchant_name,
            date: transaction.date,
            amount: transaction.amount,
            currency: transaction.iso_currency_code ?? "USD",
            category: transaction.personal_finance_category?.primary ?? transaction.category?.[0] ?? "Other",
            accountName: accountDetails.get(transaction.account_id)?.name ?? "Bank account",
            accountType: accountDetails.get(transaction.account_id)?.type ?? "depository",
          })),
        };
      }),
    );
    return NextResponse.json({ connections });
  } catch (error) {
    console.error("Plaid account retrieval failed", error);
    return NextResponse.json({ error: "Could not retrieve bank data. Try refreshing or reconnecting your bank." }, { status: 502 });
  }
}