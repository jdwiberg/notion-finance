import "server-only";

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export function isPlaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error("Add PLAID_CLIENT_ID and PLAID_SECRET to your .env.local file.");

  const environment = process.env.PLAID_ENV ?? "sandbox";
  const basePath = PlaidEnvironments[environment as keyof typeof PlaidEnvironments];
  if (!basePath) throw new Error("PLAID_ENV must be sandbox, development, or production.");

  return new PlaidApi(new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  }));
}