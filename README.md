# Ledger

A local-first personal finance app that connects to US institutions with Plaid Link and retrieves account balances and recent transactions.

## Run locally

1. In the Plaid Dashboard, copy your **Sandbox** client ID and secret.
2. Create a local environment file and generate an encryption key:

   ```bash
   cp .env.example .env.local
   openssl rand -hex 32
   ```

3. Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_TOKEN_ENCRYPTION_KEY` in `.env.local`. Keep `PLAID_ENV=sandbox` while testing.
4. Start the app:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000), choose **Connect a bank**, and complete Plaid Link. Plaid Sandbox's test institution can be used with `user_good` / `pass_good` and verification code `1234`.

The dashboard retrieves account balances and up to 100 transactions from the last 30 days. The access token is encrypted with AES-256-GCM before it is stored in `.data/finance.sqlite`; the database and `.env.local` are excluded from Git.

## Sync transactions to Notion

You can also push the fetched transactions from the local Plaid API into a Notion database.

1. Create or open a Notion database with these columns (or rename them in your environment variables):
   - `Date` (Date)
   - `Merchant` (Text)
   - `Amount` (Number)
   - `Account` (Text)
   - `Institution` (Text)
   - `Category` (Text)
2. Create a Notion integration and copy the secret token.
3. Add these values to `.env.local`:

   ```bash
   NOTION_TOKEN=secret_xxx
   NOTION_ACCOUNTS_DATABASE_ID=your_accounts_database_id
   NOTION_TRANSACTIONS_DATABASE_ID=your_transactions_database_id
   PLAID_DATA_URL=http://localhost:3000/api/plaid/data
   ```

   Optional overrides if your column names differ:

   ```bash
   NOTION_DATE_PROPERTY=Date
   NOTION_MERCHANT_PROPERTY=Merchant
   NOTION_AMOUNT_PROPERTY=Amount
   NOTION_ACCOUNT_PROPERTY=Account
   NOTION_INSTITUTION_PROPERTY=Institution
   NOTION_CATEGORY_PROPERTY=Category
   NOTION_ACCOUNT_TYPE_PROPERTY=Type
   NOTION_ACCOUNT_SUBTYPE_PROPERTY=Subtype
   NOTION_ACCOUNT_BALANCE_PROPERTY=Balance
   NOTION_ACCOUNT_CURRENCY_PROPERTY=Currency
   ```

4. Start the app and connect a bank:

   ```bash
   npm run dev
   ```

5. Run the Notion sync script:

   ```bash
   npm run sync:notion
   ```

   This will fetch the current Plaid data and create one Notion page for each connected account and each transaction in your two databases.

## Scope and deployment

This starter is intended for one trusted user on a local machine. It has no sign-in or per-user authorization, and its SQLite file is local to one server. Do not expose it publicly or deploy it as-is. A hosted or multi-user version needs authentication, user-scoped connection ownership, protected routes, and persistent production storage. Never commit Plaid secrets, the encryption key, or bank data.