#!/usr/bin/env node

const plaidDataUrl = process.env.PLAID_DATA_URL ?? "http://localhost:3000/api/plaid/data";
const notionToken = process.env.NOTION_TOKEN;
const accountsDatabaseId = process.env.NOTION_ACCOUNTS_DATABASE_ID;
const transactionsDatabaseId = process.env.NOTION_TRANSACTIONS_DATABASE_ID;

const propertyNames = {
  date: process.env.NOTION_DATE_PROPERTY ?? "Date",
  merchant: process.env.NOTION_MERCHANT_PROPERTY ?? "Merchant",
  amount: process.env.NOTION_AMOUNT_PROPERTY ?? "Amount",
  account: process.env.NOTION_ACCOUNT_PROPERTY ?? "Account",
  institution: process.env.NOTION_INSTITUTION_PROPERTY ?? "Institution",
  category: process.env.NOTION_CATEGORY_PROPERTY ?? "Category",
  accountType: process.env.NOTION_ACCOUNT_TYPE_PROPERTY ?? "Type",
  subtype: process.env.NOTION_ACCOUNT_SUBTYPE_PROPERTY ?? "Subtype",
  balance: process.env.NOTION_ACCOUNT_BALANCE_PROPERTY ?? "Balance",
  currency: process.env.NOTION_ACCOUNT_CURRENCY_PROPERTY ?? "Currency",
};

function toTitle(value) {
  return {
    title: [
      {
        text: {
          content: String(value ?? "").slice(0, 2000),
        },
      },
    ],
  };
}

function toRichText(value) {
  return {
    rich_text: [
      {
        text: {
          content: String(value ?? "").slice(0, 2000),
        },
      },
    ],
  };
}

function toSelect(value) {
  return {
    select: {
      name: String(value ?? "Unknown").slice(0, 100),
    },
  };
}

function toRelation(pageId) {
  return {
    relation: [{ id: pageId }],
  };
}

function signedAccountBalance(account) {
  const balance = Number(account.balance ?? 0);
  return account.type === "credit" ? -Math.abs(balance) : balance;
}

function signedTransactionAmount(transaction) {
  return -Number(transaction.amount ?? 0);
}

async function updatePage(pageId, properties) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({ properties }),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(`Notion page update failed: ${JSON.stringify(errorJson)}`);
  }
}

async function queryDatabase(databaseId, filter) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({ filter }),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(`Notion query failed: ${JSON.stringify(errorJson)}`);
  }

  const data = await response.json();
  return data.results ?? [];
}

async function findExistingAccountPage(account, institutionName) {
  const results = await queryDatabase(accountsDatabaseId, {
    and: [
      { property: propertyNames.account, title: { equals: account.name ?? "Unknown account" } },
      { property: propertyNames.institution, rich_text: { equals: institutionName } },
    ],
  });

  return results[0] ?? null;
}

async function findExistingTransactionPage(transaction, connectionName) {
  const merchant = transaction.merchant ?? transaction.name ?? "Unknown merchant";
  const amounts = [...new Set([Number(transaction.amount ?? 0), signedTransactionAmount(transaction)])];

  const results = await queryDatabase(transactionsDatabaseId, {
    and: [
      { property: propertyNames.date, date: { equals: transaction.date } },
      { property: propertyNames.merchant, rich_text: { equals: merchant } },
      { or: amounts.map((amount) => ({ property: propertyNames.amount, number: { equals: amount } })) },
      { property: propertyNames.institution, rich_text: { equals: connectionName } },
    ],
  });

  return results[0] ?? null;
}

function buildAccountPage(account, institutionName) {
  return {
    parent: { database_id: accountsDatabaseId },
    properties: {
      [propertyNames.account]: toTitle(account.name ?? "Unknown account"),
      [propertyNames.institution]: toRichText(institutionName),
      [propertyNames.accountType]: toSelect(account.type ?? "Unknown"),
      [propertyNames.subtype]: toRichText(account.subtype ?? "Unknown"),
      [propertyNames.balance]: {
        number: signedAccountBalance(account),
      },
      [propertyNames.currency]: toRichText(account.currency ?? "USD"),
    },
  };
}

function buildTransactionPage(transaction, connectionName, accountPageId) {
  const merchant = transaction.merchant ?? transaction.name ?? "Unknown merchant";
  const account = transaction.accountName ?? "Unknown account";
  const category = transaction.category ?? "Other";

  return {
    parent: { database_id: transactionsDatabaseId },
    properties: {
      [propertyNames.date]: {
        date: { start: transaction.date },
      },
      [propertyNames.merchant]: toRichText(merchant),
      [propertyNames.amount]: {
        number: signedTransactionAmount(transaction),
      },
      [propertyNames.account]: accountPageId ? toRelation(accountPageId) : toRichText(account),
      [propertyNames.institution]: toRichText(connectionName),
      [propertyNames.category]: toRichText(category),
    },
  };
}

async function main() {
  if (!notionToken || !accountsDatabaseId || !transactionsDatabaseId) {
    console.error("Missing NOTION_TOKEN, NOTION_ACCOUNTS_DATABASE_ID, or NOTION_TRANSACTIONS_DATABASE_ID in .env.local");
    process.exit(1);
  }

  console.log(`Fetching Plaid data from ${plaidDataUrl}...`);

  const plaidResponse = await fetch(plaidDataUrl);
  if (!plaidResponse.ok) {
    const text = await plaidResponse.text();
    throw new Error(`Plaid fetch failed (${plaidResponse.status}): ${text}`);
  }

  const plaidData = await plaidResponse.json();
  const connections = plaidData.connections ?? [];

  let accountsSynced = 0;
  let transactionsSynced = 0;
  const accountPageIds = new Map();

  for (const connection of connections) {
    const institutionName = connection.institutionName ?? "Connected institution";

    for (const account of connection.accounts ?? []) {
      const existingAccount = await findExistingAccountPage(account, institutionName);
      if (existingAccount) {
        await updatePage(existingAccount.id, {
          [propertyNames.balance]: { number: signedAccountBalance(account) },
        });
        accountsSynced += 1;
        const key = `${institutionName}::${account.name ?? "Unknown account"}`;
        accountPageIds.set(key, existingAccount.id);
        console.log(`Updated account ${account.name} in Notion.`);
        continue;
      }

      const accountPayload = buildAccountPage(account, institutionName);
      const notionResponse = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(accountPayload),
      });

      const notionJson = await notionResponse.json().catch(() => ({}));
      if (!notionResponse.ok) {
        console.error("Notion account request failed:", notionJson);
        throw new Error(`Failed to add account ${account.id || "unknown"} to Notion.`);
      }

      const key = `${institutionName}::${account.name ?? "Unknown account"}`;
      accountPageIds.set(key, notionJson.id);

      accountsSynced += 1;
      console.log(`Synced account ${account.name} to Notion.`);
    }

    for (const transaction of connection.transactions ?? []) {
      const existingTransaction = await findExistingTransactionPage(transaction, institutionName);
      if (existingTransaction) {
        await updatePage(existingTransaction.id, {
          [propertyNames.amount]: { number: signedTransactionAmount(transaction) },
        });
        transactionsSynced += 1;
        console.log(`Updated transaction ${transaction.date} | ${transaction.merchant ?? transaction.name}.`);
        continue;
      }

      const accountKey = `${institutionName}::${transaction.accountName ?? "Unknown account"}`;
      const accountPageId = accountPageIds.get(accountKey);
      const transactionPayload = buildTransactionPage(transaction, institutionName, accountPageId);
      const notionResponse = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(transactionPayload),
      });

      const notionJson = await notionResponse.json().catch(() => ({}));
      if (!notionResponse.ok) {
        console.error("Notion transaction request failed:", notionJson);
        throw new Error(`Failed to add transaction ${transaction.id || "unknown"} to Notion.`);
      }

      transactionsSynced += 1;
      console.log(`Synced ${transaction.date} | ${transaction.merchant ?? transaction.name} | ${signedTransactionAmount(transaction)}`);
    }
  }

  console.log(`Done. Synced ${accountsSynced} account(s) and ${transactionsSynced} transaction(s) to Notion.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
