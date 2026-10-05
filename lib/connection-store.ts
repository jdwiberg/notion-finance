import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

type StoredConnection = {
  itemId: string;
  institutionName: string;
  accessToken: string;
};

const globalForStore = globalThis as typeof globalThis & { financeDatabase?: Database.Database };

function getEncryptionKey() {
  const value = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) {
    throw new Error("Set PLAID_TOKEN_ENCRYPTION_KEY to a 32-byte hex key in .env.local.");
  }
  return Buffer.from(value, "hex");
}

function getDatabase() {
  if (!globalForStore.financeDatabase) {
    const directory = path.join(process.cwd(), ".data");
    mkdirSync(directory, { recursive: true });
    const database = new Database(path.join(directory, "finance.sqlite"));
    database.pragma("journal_mode = WAL");
    database.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        item_id TEXT PRIMARY KEY,
        institution_name TEXT NOT NULL,
        encrypted_access_token TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    globalForStore.financeDatabase = database;
  }
  return globalForStore.financeDatabase;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ciphertext.toString("hex")}`;
}

function decrypt(value: string) {
  const [ivHex, tagHex, ciphertextHex] = value.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error("Stored bank token has an invalid format.");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function saveConnection(itemId: string, institutionName: string, accessToken: string) {
  getDatabase()
    .prepare(`
      INSERT INTO connections (item_id, institution_name, encrypted_access_token)
      VALUES (?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        institution_name = excluded.institution_name,
        encrypted_access_token = excluded.encrypted_access_token
    `)
    .run(itemId, institutionName, encrypt(accessToken));
}

export function getConnections(): StoredConnection[] {
  const rows = getDatabase()
    .prepare("SELECT item_id, institution_name, encrypted_access_token FROM connections ORDER BY created_at")
    .all() as { item_id: string; institution_name: string; encrypted_access_token: string }[];

  return rows.map((row) => ({
    itemId: row.item_id,
    institutionName: row.institution_name,
    accessToken: decrypt(row.encrypted_access_token),
  }));
}